"""End-to-end smoke test hitting every API endpoint against a running server.

Run the server (uvicorn app.main:app --port 8000) and reseed first, then:
    uv run python smoke_test.py
Exits non-zero on the first failed assertion.
"""

import sys

import httpx

BASE = "http://127.0.0.1:8000"
passed = 0


def check(label: str, cond: bool, extra: str = "") -> None:
    global passed
    mark = "PASS" if cond else "FAIL"
    print(f"[{mark}] {label}" + (f" — {extra}" if extra else ""))
    if not cond:
        sys.exit(f"Assertion failed: {label}")
    passed += 1


with httpx.Client(base_url=BASE, timeout=30) as c:
    # 1. health
    r = c.get("/health")
    check("GET /health 200", r.status_code == 200, str(r.json()))

    # 2. list outbound
    r = c.get("/api/v1/loads", params={"direction": "outbound"})
    check("GET /loads?direction=outbound 200", r.status_code == 200)
    outbound = r.json()
    check("outbound loads returned", outbound["total"] >= 3, f"total={outbound['total']}")
    check("num_stops present", "num_stops" in outbound["items"][0])

    # 3. list inbound
    r = c.get("/api/v1/loads", params={"direction": "inbound"})
    check("GET /loads?direction=inbound 200", r.status_code == 200)
    check("inbound loads returned", r.json()["total"] >= 2)

    # 4. status filter
    r = c.get("/api/v1/loads", params={"status": "available"})
    check("GET /loads?status=available 200", r.status_code == 200)
    check("only available returned",
          all(i["status"] == "available" for i in r.json()["items"]))

    # 5. pagination limit enforcement
    r = c.get("/api/v1/loads", params={"limit": 999})
    check("GET /loads?limit=999 -> 422 (max 100)", r.status_code == 422)

    # pick an available outbound load for the write tests
    avail = [i for i in outbound["items"] if i["status"] == "available"]
    load_id = avail[0]["id"]

    # 6. get detail
    r = c.get(f"/api/v1/loads/{load_id}")
    check("GET /loads/{id} 200", r.status_code == 200)
    detail = r.json()
    check("detail has stops", len(detail["stops"]) >= 1)
    check("detail has customer + coords",
          "customer_company_name" in detail and "origin_lat" in detail)
    stop_id = detail["stops"][0]["id"]

    # 7. get missing load -> 404 envelope
    r = c.get("/api/v1/loads/00000000-0000-0000-0000-000000000000")
    check("GET /loads/{missing} 404", r.status_code == 404)
    check("404 uses error envelope",
          r.json()["error"]["code"] == "LOAD_NOT_FOUND", str(r.json()))

    # 8. place email bid (real Resend attempt; sent or recorded both OK)
    r = c.post(f"/api/v1/loads/{load_id}/bids", json={
        "method": "email", "target_amount": 2300, "rate_type": "all_in",
        "subject": "Bid on load", "body": "We can cover this at $2,300 all-in.",
    })
    check("POST email bid 201", r.status_code == 201, str(r.json()))
    email_bid = r.json()
    check("email bid status sent|recorded",
          email_bid["status"] in ("sent", "recorded"), email_bid["status"])
    check("email bid has nested load", email_bid["load"]["id"] == load_id)

    # 9. email bid missing required fields -> 422
    r = c.post(f"/api/v1/loads/{load_id}/bids", json={
        "method": "email", "target_amount": 100,
    })
    check("POST email bid w/o subject/body -> 422", r.status_code == 422)

    # 10. place call bid -> recorded
    r = c.post(f"/api/v1/loads/{load_id}/bids", json={
        "method": "call", "target_amount": 2250, "call_mode": "auto_agent",
    })
    check("POST call bid 201", r.status_code == 201)
    check("call bid recorded", r.json()["status"] == "recorded", r.json()["status"])

    # 11. load status advanced to bid_placed
    r = c.get(f"/api/v1/loads/{load_id}")
    check("load now bid_placed", r.json()["status"] == "bid_placed", r.json()["status"])

    # 12. delete a load WITH bids -> 409
    r = c.request("DELETE", f"/api/v1/loads/{load_id}")
    check("DELETE load with bids -> 409", r.status_code == 409)
    check("409 code LOAD_HAS_BIDS", r.json()["error"]["code"] == "LOAD_HAS_BIDS")

    # 13. list bids + filter
    r = c.get("/api/v1/bids")
    check("GET /bids 200", r.status_code == 200)
    check("bids include the ones just placed", r.json()["total"] >= 4)
    r = c.get("/api/v1/bids", params={"method": "call"})
    check("GET /bids?method=call filters",
          all(b["method"] == "call" for b in r.json()["items"]))

    # 14. create a new load (Create Order)
    new_load = {
        "order_id": "TEST-CREATE-1", "shipper_name": "Test Shipper",
        "origin_city": "Newark", "origin_state": "NJ",
        "origin_lat": 40.7357, "origin_lng": -74.1724,
        "destination_city": "Columbus", "destination_state": "OH",
        "destination_lat": 39.9612, "destination_lng": -82.9988,
        "distance_miles": 520, "weight_lbs": 30000, "equipment_type": "Van",
        "posted_rate": 1600, "pickup_deadhead_miles": 5, "source": "Manual",
        "broker_email": "test@broker.com", "broker_phone": "+15550001111",
        "customer_company_name": "Test Customer",
        "stops": [
            {"sequence": 1, "stop_type": "pickup", "city": "Newark", "state": "NJ",
             "lat": 40.7357, "lng": -74.1724},
            {"sequence": 2, "stop_type": "delivery", "city": "Columbus", "state": "OH",
             "lat": 39.9612, "lng": -82.9988},
        ],
    }
    r = c.post("/api/v1/loads", json=new_load)
    check("POST /loads 201", r.status_code == 201, str(r.json()))
    created = r.json()
    check("created load has 2 stops", created["num_stops"] == 2)
    created_id = created["id"]

    # 15. duplicate order_id -> 409
    r = c.post("/api/v1/loads", json=new_load)
    check("POST duplicate order_id -> 409", r.status_code == 409)
    check("409 DUPLICATE_ORDER_ID", r.json()["error"]["code"] == "DUPLICATE_ORDER_ID")

    # 16. create load with no delivery stop -> 422
    bad = {**new_load, "order_id": "TEST-BAD",
           "stops": [{"sequence": 1, "stop_type": "pickup", "city": "Newark",
                      "state": "NJ", "lat": 40.7, "lng": -74.1}]}
    r = c.post("/api/v1/loads", json=bad)
    check("POST load w/o delivery -> 422", r.status_code == 422)

    # 17. edit the created load
    r = c.patch(f"/api/v1/loads/{created_id}", json={"posted_rate": 1750})
    check("PATCH /loads/{id} 200", r.status_code == 200)
    check("edit applied", float(r.json()["posted_rate"]) == 1750.0)

    # 18. empty patch -> 422
    r = c.patch(f"/api/v1/loads/{created_id}", json={})
    check("PATCH empty body -> 422", r.status_code == 422)

    # 19. mark stop arrival -> status advances to in_transit
    created_stop = created["stops"][0]["id"]
    r = c.patch(f"/api/v1/loads/{created_id}/stops/{created_stop}",
                json={"actual_arrival_time": "2026-07-05T12:00:00Z"})
    check("PATCH mark arrival 200", r.status_code == 200, str(r.json())[:200])
    check("status -> in_transit", r.json()["status"] == "in_transit", r.json()["status"])

    # 20. delete the created load (no bids) -> 204
    r = c.request("DELETE", f"/api/v1/loads/{created_id}")
    check("DELETE load w/o bids -> 204", r.status_code == 204)
    r = c.get(f"/api/v1/loads/{created_id}")
    check("deleted load now 404", r.status_code == 404)

    # 21. cannot bid on inbound load -> 409
    r = c.get("/api/v1/loads", params={"direction": "inbound"})
    inbound_id = r.json()["items"][0]["id"]
    r = c.post(f"/api/v1/loads/{inbound_id}/bids", json={
        "method": "call", "target_amount": 1000, "call_mode": "manual"})
    check("POST bid on inbound -> 409", r.status_code == 409)
    check("409 INBOUND_BID_NOT_ALLOWED",
          r.json()["error"]["code"] == "INBOUND_BID_NOT_ALLOWED")

print(f"\nAll {passed} checks passed.")
