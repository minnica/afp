"""Contrasta un snapshot de solo lectura con respuestas guardadas de ambas API.

Uso: python3 scripts/audit-card-breakdowns.py <directorio-evidencia> [antes|despues]
No usa credenciales, no se conecta a la BD y no modifica los datos originales.
"""
import calendar
import json
import sys
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

directory = Path(sys.argv[1])
phase = sys.argv[2] if len(sys.argv) > 2 else "despues"
snapshot = json.loads((directory / "snapshot.json").read_text())
cards_api = json.loads((directory / f"tarjetas-{phase}.json").read_text())
dashboard = json.loads((directory / f"dashboard-{phase}.json").read_text())
today = snapshot["readAt"][:10]
cards = {row["id"]: row for row in snapshot["cards"]}


def cents(value):
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def day(value):
    return value[:10]


def index(year, month):
    return year * 12 + month - 1


def month_day(year, month, charge_day):
    return date(year, month, min(charge_day, calendar.monthrange(year, month)[1])).isoformat()


def cycle_expected(cycle):
    card = cards[cycle["cardId"]]
    start, end = day(cycle["startDate"]), day(cycle["cutDate"])
    target = index(cycle["year"], cycle["month"])
    all_expenses = [e for e in snapshot["expenses"] if e["cardId"] == card["id"] and e["paymentMethod"] == "CARD"]
    expenses = [e for e in all_expenses if start <= day(e["date"]) <= end]
    linked = {(e["subscriptionId"], e["date"][:7]) for e in all_expenses if e["subscriptionId"]}
    subscriptions = []
    for sub in snapshot["subscriptions"]:
        if sub["cardId"] != card["id"] or sub["paymentMethod"] != "CARD":
            continue
        first = index(sub["startYear"] or cycle["year"], sub["startMonth"] or cycle["month"])
        for current in range(index(int(start[:4]), int(start[5:7])), index(int(end[:4]), int(end[5:7])) + 1):
            if current < first or (current - first) % (sub["frequencyMonths"] or 1):
                continue
            charge = month_day(current // 12, current % 12 + 1, sub["chargeDay"])
            if not start <= charge <= end:
                continue
            if not sub["isActive"] and (not sub["deactivatedAt"] or charge > day(sub["deactivatedAt"])):
                continue
            if (sub["id"], charge[:7]) in linked:
                continue
            amount = sub["amount"]
            evidence = cycle.get("usageReconciliation") or {}
            receipts = [r for r in evidence.get("subscriptionCharges", []) if r["subscriptionId"] == sub["id"] and r["date"][:7] == charge[:7]]
            if len(receipts) == 1 and receipts[0].get("applyToCycleAmount") is True:
                assert evidence["version"] == 1 and evidence["source"] and len(evidence["sourceSha256"]) == 64
                assert evidence["startDate"] <= receipts[0]["date"] <= evidence["cutDate"]
                assert evidence["cutDate"][:7] == f'{cycle["year"]}-{cycle["month"]:02}'
                amount = receipts[0]["amount"]
            subscriptions.append({"id": sub["id"], "date": charge, "amount": cents(amount)})
    purchases = []
    for purchase in snapshot["purchases"]:
        if purchase["cardId"] != card["id"] or purchase["status"] not in ("ACTIVE", "PAID_OFF"):
            continue
        if day(purchase["purchaseDate"]) > end or (purchase["status"] == "PAID_OFF" and end >= today):
            continue
        references = sorted(purchase.get("statementReconciliations") or [], key=lambda r: index(r["year"], r["month"]))
        if references:
            prior = [r for r in references if index(r["year"], r["month"]) <= target]
            anchor = prior[-1] if prior else references[0]
            number = anchor["paymentNumber"] + target - index(anchor["year"], anchor["month"])
        else:
            origin = date.fromisoformat(day(purchase["purchaseDate"]))
            first = index(origin.year, origin.month) + int(origin.isoformat() > month_day(origin.year, origin.month, card["usualCutDay"]))
            number = target - first + 1
        if not 1 <= number <= purchase["months"]:
            continue
        reference = next((r for r in references if index(r["year"], r["month"]) == target), None)
        amount = reference["amount"] if reference else (purchase["manualMonthlyPayment"] or Decimal(purchase["totalAmount"]) / purchase["months"])
        purchases.append({"id": purchase["id"], "number": number, "amount": cents(amount)})
    credits = [r for r in snapshot["credits"] if r["cycleId"] == cycle["id"]]
    parts = {"expensesAmount": sum(cents(e["amount"]) for e in expenses),
             "subscriptionsAmount": sum(s["amount"] for s in subscriptions),
             "purchasesAmount": sum(p["amount"] for p in purchases),
             "creditsAmount": sum(cents(c["amount"]) for c in credits)}
    parts["grossCalculatedAmount"] = sum(parts[k] for k in ("expensesAmount", "subscriptionsAmount", "purchasesAmount"))
    parts["calculatedAmount"] = parts["grossCalculatedAmount"] - parts["creditsAmount"]
    return parts


errors, totals, bank_gaps, quality = [], [], [], []
multiple_periods, uncovered_expenses = [], []
for key in ("cards", "cycles", "expenses", "subscriptions", "purchases", "credits"):
    rows = snapshot[key]
    assert len({row["id"] for row in rows}) == len(rows), f"IDs duplicados: {key}"
for card in cards.values():
    cycles = sorted((c for c in snapshot["cycles"] if c["cardId"] == card["id"]), key=lambda c: c["startDate"])
    for prev, nxt in zip(cycles, cycles[1:]):
        gap = (date.fromisoformat(day(nxt["startDate"])) - date.fromisoformat(day(prev["cutDate"]))).days
        if gap != 1:
            quality.append({"card": card["name"], "month": nxt["month"], "daysBetweenPeriods": gap})
for expense in snapshot["expenses"]:
    if not expense["cardId"]:
        continue
    periods = [c for c in snapshot["cycles"] if c["cardId"] == expense["cardId"]]
    matching = [c for c in periods if day(c["startDate"]) <= day(expense["date"]) <= day(c["cutDate"])]
    item = {"card": cards[expense["cardId"]]["name"], "date": day(expense["date"]),
            "concept": expense["concept"], "amount": cents(expense["amount"]) / 100}
    if len(matching) > 1:
        multiple_periods.append({**item, "months": [c["month"] for c in matching]})
    elif periods and not matching and min(day(c["startDate"]) for c in periods) <= day(expense["date"]) <= max(day(c["cutDate"]) for c in periods):
        uncovered_expenses.append(item)
for source_cycle in snapshot["cycles"]:
    expected = cycle_expected(source_cycle)
    label = {"card": cards[source_cycle["cardId"]]["name"], "year": source_cycle["year"], "month": source_cycle["month"]}
    for source, rows in (("tarjetas", cards_api["cycles"]), ("dashboard", dashboard["cycles"])):
        actual = next(c for c in rows if c["id"] == source_cycle["id"])
        for field, value in expected.items():
            if cents(actual[field]) != value:
                errors.append({**label, "source": source, "field": field, "actual": cents(actual[field]) / 100, "expected": value / 100})
        if source == "tarjetas":
            for field, detail in (("expensesAmount", "includedExpenses"), ("subscriptionsAmount", "includedSubscriptions"), ("purchasesAmount", "includedPurchases"), ("creditsAmount", "includedCredits")):
                if cents(actual[field]) != sum(cents(row["amount"]) for row in actual[detail]):
                    errors.append({**label, "source": source, "field": field, "error": "Detalle no suma al subtotal"})
    if source_cycle["statementAmount"] is not None:
        gap = cents(source_cycle["statementAmount"]) - expected["calculatedAmount"]
        if gap:
            bank_gaps.append({**label, "statement": cents(source_cycle["statementAmount"]) / 100, "calculated": expected["calculatedAmount"] / 100, "difference": gap / 100})
    totals.append({**label, **{k: v / 100 for k, v in expected.items()}})
usage_errors = []
for month_rows in dashboard["cardUsageWaiversByMonth"].values():
    for row in month_rows:
        breakdown = row["breakdown"]
        calculated = sum(cents(e["amount"]) for section in ("includedDailyExpenses", "includedSubscriptions", "includedInstallmentPurchases") for e in breakdown.get(section, []))
        if calculated != cents(row["eligibleSpend"]):
            usage_errors.append(row["card"]["name"])
monthly_errors = []
for month, rows in dashboard["categoryBreakdownByMonth"].items():
    comparison = dashboard["weeklyComparisonByMonth"][month]
    if sum(cents(r["total"]) for r in rows) != cents(comparison["currMonthTotal"]) or sum(cents(w["currTotal"]) for w in comparison["weeks"]) != cents(comparison["currMonthTotal"]):
        monthly_errors.append(month)
    for category in rows:
        total = dashboard["weeklyComparisonByCategoryAndMonth"][category["id"]][month]["currMonthTotal"]
        if cents(total) != cents(category["total"]):
            monthly_errors.append({"month": month, "category": category["name"]})
report = {"snapshotAt": snapshot["readAt"], "phase": phase, "cycles": len(totals), "independentMismatches": errors,
          "usageBreakdowns": sum(len(rows) for rows in dashboard["cardUsageWaiversByMonth"].values()),
          "usageSumMismatches": usage_errors, "monthlyConsistencyMismatches": monthly_errors,
          "periodGapsOrOverlaps": quality, "expensesInMultiplePeriods": multiple_periods, "expensesInUncoveredDays": uncovered_expenses,
          "capturedStatements": sum(c["statementAmount"] is not None for c in snapshot["cycles"]),
          "statementDifferences": bank_gaps, "totals": totals}
(directory / f"auditoria-{phase}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k != "totals"}, ensure_ascii=False))
if phase == "despues" and (errors or usage_errors or monthly_errors):
    sys.exit(1)
