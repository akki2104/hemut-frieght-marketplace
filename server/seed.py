"""Seed the database with sample loads, stops, and a couple of existing bids.

Run with: ``uv run python seed.py`` (idempotent — clears the three tables first).
Stands in for the real load-board sourcing pipeline, which is out of scope.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete

from app.core.database import AsyncSessionLocal
from app.models import Bid, Load, Stop
from app.models.enums import (
    BidMethod,
    BidStatus,
    CallMode,
    LoadDirection,
    LoadStatus,
    RateType,
    StopType,
)

# Reference coordinates for the cities used below.
COORDS = {
    ("Jersey City", "NJ"): (40.7178, -74.0431),
    ("Frederick", "MD"): (39.4143, -77.4105),
    ("Shelby Twp", "MI"): (42.6706, -83.0330),
    ("Haines City", "FL"): (28.1147, -81.6201),
    ("Monrovia", "MD"): (39.3373, -77.2603),
    ("Newark", "NJ"): (40.7357, -74.1724),
    ("Columbus", "OH"): (39.9612, -82.9988),
    ("Chicago", "IL"): (41.8781, -87.6298),
    ("Atlanta", "GA"): (33.7490, -84.3880),
    ("Dallas", "TX"): (32.7767, -96.7970),
}


def _c(city: str, state: str) -> tuple[float, float]:
    return COORDS[(city, state)]


def _stop(seq: int, kind: StopType, city: str, state: str, day_offset: int) -> Stop:
    lat, lng = _c(city, state)
    return Stop(
        sequence=seq,
        stop_type=kind,
        city=city,
        state=state,
        lat=lat,
        lng=lng,
        scheduled_time=datetime.now(timezone.utc) + timedelta(days=day_offset),
    )


def _load(**kwargs) -> Load:
    (o_lat, o_lng) = _c(kwargs["origin_city"], kwargs["origin_state"])
    (d_lat, d_lng) = _c(kwargs["destination_city"], kwargs["destination_state"])
    kwargs.update(
        origin_lat=o_lat,
        origin_lng=o_lng,
        destination_lat=d_lat,
        destination_lng=d_lng,
    )
    return Load(**kwargs)


def build_loads() -> list[Load]:
    loads: list[Load] = []

    # --- Outbound loads (available to bid on) ---
    l1 = _load(
        direction=LoadDirection.outbound,
        order_id="ZS1ZTwxG",
        origin_city="Jersey City", origin_state="NJ",
        destination_city="Frederick", destination_state="MD",
        shipper_name="Sunset Transportation Inc",
        distance_miles=240, weight_lbs=42337, equipment_type="Van",
        posted_rate=Decimal("1150.00"), pickup_deadhead_miles=4, source="DAT",
        broker_email="VoomaMNSP@sunsettrans.com", broker_phone="+16516155506",
        status=LoadStatus.available,
        customer_company_name="Sunset Transportation Inc",
        customer_contact_name="Dispatch Desk", customer_contact_phone="+16516155506",
        instructions="Appointment required at delivery. No overnight parking on-site.",
    )
    l1.stops = [
        _stop(1, StopType.pickup, "Jersey City", "NJ", 3),
        _stop(2, StopType.delivery, "Frederick", "MD", 3),
    ]
    loads.append(l1)

    l2 = _load(
        direction=LoadDirection.outbound,
        order_id="ZS1Zar8s",
        origin_city="Jersey City", origin_state="NJ",
        destination_city="Shelby Twp", destination_state="MI",
        shipper_name="Nolan Transportation Group Inc",
        distance_miles=640, weight_lbs=25000, equipment_type="Van",
        posted_rate=Decimal("1875.00"), pickup_deadhead_miles=4, source="DAT",
        broker_email="mwmatches@ntgfreight.com", broker_phone="+14703051182",
        status=LoadStatus.available,
        customer_company_name="Nolan Transportation Group Inc",
        customer_contact_name="Broker Team", customer_contact_phone="+14703051182",
    )
    l2.stops = [
        _stop(1, StopType.pickup, "Jersey City", "NJ", 2),
        _stop(2, StopType.delivery, "Shelby Twp", "MI", 3),
    ]
    loads.append(l2)

    # Multi-stop: one pickup, two deliveries.
    l3 = _load(
        direction=LoadDirection.outbound,
        order_id="ZS1ZV8yn",
        origin_city="Jersey City", origin_state="NJ",
        destination_city="Haines City", destination_state="FL",
        shipper_name="Total Quality Logistics",
        distance_miles=1121, weight_lbs=39312, equipment_type="Van or Reefer",
        posted_rate=Decimal("2450.00"), pickup_deadhead_miles=4, source="DAT",
        broker_email="JGabrielson@tql.com", broker_phone="+14703051182",
        status=LoadStatus.available,
        customer_company_name="Total Quality Logistics",
        customer_contact_name="Jordan Gabrielson", customer_contact_phone="+14703051182",
        instructions="Two drops — deliver Monrovia first, then Haines City.",
    )
    l3.stops = [
        _stop(1, StopType.pickup, "Jersey City", "NJ", 1),
        _stop(2, StopType.delivery, "Monrovia", "MD", 2),
        _stop(3, StopType.delivery, "Haines City", "FL", 4),
    ]
    loads.append(l3)

    l4 = _load(
        direction=LoadDirection.outbound,
        order_id="ZS1Zqp09",
        origin_city="Chicago", origin_state="IL",
        destination_city="Atlanta", destination_state="GA",
        shipper_name="Echo Global Logistics",
        distance_miles=717, weight_lbs=36000, equipment_type="Reefer",
        posted_rate=Decimal("2100.00"), pickup_deadhead_miles=12, source="Uber Freight",
        broker_email="ops@echo.com", broker_phone="+13125550147",
        status=LoadStatus.bid_placed,
        customer_company_name="Echo Global Logistics",
        customer_contact_name="Carrier Ops", customer_contact_phone="+13125550147",
    )
    l4.stops = [
        _stop(1, StopType.pickup, "Chicago", "IL", 2),
        _stop(2, StopType.delivery, "Atlanta", "GA", 4),
    ]
    loads.append(l4)

    # --- Inbound loads (already committed — read-only tracking) ---
    l5 = _load(
        direction=LoadDirection.inbound,
        order_id="INB-4401",
        origin_city="Dallas", origin_state="TX",
        destination_city="Newark", destination_state="NJ",
        shipper_name="Meiborg Brothers Inc",
        distance_miles=1550, weight_lbs=41000, equipment_type="Van",
        posted_rate=Decimal("3200.00"), pickup_deadhead_miles=0, source="Direct",
        broker_email="inbound@meiborg.com", broker_phone="+19735550100",
        status=LoadStatus.in_transit,
        customer_company_name="Walmart DC #6094",
        customer_contact_name="Receiving", customer_contact_phone="+19735550100",
        driver_name="Marcus Reilly", driver_phone="+18155550188",
    )
    s1 = _stop(1, StopType.pickup, "Dallas", "TX", -2)
    s1.actual_arrival_time = datetime.now(timezone.utc) - timedelta(days=2)
    l5.stops = [s1, _stop(2, StopType.delivery, "Newark", "NJ", 1)]
    loads.append(l5)

    l6 = _load(
        direction=LoadDirection.inbound,
        order_id="INB-4402",
        origin_city="Columbus", origin_state="OH",
        destination_city="Jersey City", destination_state="NJ",
        shipper_name="Meiborg Brothers Inc",
        distance_miles=520, weight_lbs=28000, equipment_type="Van",
        posted_rate=Decimal("1400.00"), pickup_deadhead_miles=0, source="Direct",
        broker_email="inbound@meiborg.com", broker_phone="+19735550100",
        status=LoadStatus.delivered,
        customer_company_name="Home Depot RDC",
        customer_contact_name="Dock 12", customer_contact_phone="+19735550100",
        driver_name="Priya Nadar", driver_phone="+16145550133",
    )
    p1 = _stop(1, StopType.pickup, "Columbus", "OH", -3)
    p1.actual_arrival_time = datetime.now(timezone.utc) - timedelta(days=3)
    p2 = _stop(2, StopType.delivery, "Jersey City", "NJ", -1)
    p2.actual_arrival_time = datetime.now(timezone.utc) - timedelta(days=1)
    l6.stops = [p1, p2]
    loads.append(l6)

    return loads


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        # Idempotent: clear existing rows (bids before loads for the FK).
        await session.execute(delete(Bid))
        await session.execute(delete(Stop))
        await session.execute(delete(Load))
        await session.flush()

        loads = build_loads()
        session.add_all(loads)
        await session.flush()

        # A couple of existing bids so the My Bids tab isn't empty on first load.
        by_order = {l.order_id: l for l in loads}
        session.add_all(
            [
                Bid(
                    load_id=by_order["ZS1Zqp09"].id,
                    method=BidMethod.email,
                    target_amount=Decimal("2000.00"),
                    rate_type=RateType.all_in,
                    status=BidStatus.sent,
                    subject="Bid on Chicago, IL → Atlanta, GA (ZS1Zqp09)",
                    body="Hi, we can cover this reefer load at $2,000 all-in. Please confirm.",
                ),
                Bid(
                    load_id=by_order["ZS1Zar8s"].id,
                    method=BidMethod.call,
                    target_amount=Decimal("1800.00"),
                    call_mode=CallMode.auto_agent,
                    status=BidStatus.recorded,
                ),
            ]
        )
        await session.commit()

    print(f"Seeded {len(loads)} loads (with stops) and 2 bids.")


if __name__ == "__main__":
    asyncio.run(seed())
