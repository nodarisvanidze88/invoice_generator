from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook

HEADER = ["JAN / Code", "Product Name", "Material", "Origin", "Weight(g)", "Unit Price", "Product Category", "Tariff Code"]


def workbook_bytes(*rows: list) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def upload(client: TestClient, path: str, content: bytes) -> dict:
    response = client.post(path, files={"file": ("products.xlsx", content)})
    assert response.status_code == 200, response.text
    return response.json()


def test_preview_classifies_new_existing_and_problems(auth_client: TestClient, make_product) -> None:
    registered = make_product(code="4901 / 4902", unit_price=100)
    no_code = make_product(code="", name="Handmade Bowl")
    content = workbook_bytes(
        ["4902", "Pineapple Candy 110g", "", "Japan", 120, 150, "Sugar-based Candy", "17049099"],
        ["", "handmade bowl", "", "", None, None, "", ""],
        ["5555", "Brand new toy", "", "China", 50, 300, "Plastic Toy", "95030070"],
        ["5555", "Brand new toy again", "", "China", 50, 300, "Plastic Toy", "95030070"],
        ["6666", "Bad price", "", "", None, "abc", "", ""],
    )
    preview = upload(auth_client, "/api/products/import.xlsx/preview", content)

    assert [r["name"] for r in preview["new"]] == ["Brand new toy"]
    existing = {r["row"]: r for r in preview["existing"]}
    assert existing[2]["product_id"] == registered["id"]
    assert existing[2]["product_name"] == "Pineapple Candy 110g"
    assert [(c["label"], c["current"], c["incoming"]) for c in existing[2]["changes"]] == [
        ("JAN / Code", "4901 / 4902", "4902"),
        ("Unit Price", 100, 150),
    ]
    assert existing[3]["product_id"] == no_code["id"]
    problems = {r["row"]: r for r in preview["problems"]}
    assert problems[5]["status"] == "duplicate" and problems[5]["message"] == "Same product as row 4"
    assert problems[6]["status"] == "invalid" and "Unit Price" in problems[6]["message"]


def test_new_only_mode_adds_new_and_leaves_registered_untouched(auth_client: TestClient, make_product) -> None:
    registered = make_product(code="4902", unit_price=100)
    content = workbook_bytes(
        ["4902", "Renamed in file", "", "Japan", 120, 999, "Sugar-based Candy", "17049099"],
        ["5555", "Brand new toy", "", "China", 50, 300, "Plastic Toy", "95030070"],
    )
    summary = upload(auth_client, "/api/products/import.xlsx", content)
    assert summary == {"created": 1, "updated": 0, "unchanged": 0, "skipped_existing": 1, "skipped_invalid": 0}
    products = {p["code"]: p for p in auth_client.get("/api/products").json()}
    assert products["4902"]["unit_price"] == registered["unit_price"]
    assert products["4902"]["name"] == registered["name"]
    assert products["5555"]["name"] == "Brand new toy"


def test_upsert_mode_updates_changed_products_only(auth_client: TestClient, make_product) -> None:
    make_product(code="1", unit_price=100)
    same = make_product(code="2")
    content = workbook_bytes(
        ["1", "Pineapple Candy 110g", "", "Japan", 120, 120, "Sugar-based Candy", "17049099"],
        ["2", same["name"], same["material"], same["origin"], same["weight_g"], same["unit_price"], same["category"], same["tariff_code"]],
    )
    summary = upload(auth_client, "/api/products/import.xlsx?mode=upsert", content)
    assert (summary["updated"], summary["unchanged"], summary["created"]) == (1, 1, 0)
    assert {p["code"]: p["unit_price"] for p in auth_client.get("/api/products").json()}["1"] == 120


def test_exact_code_wins_over_part_of_a_multi_code(auth_client: TestClient, make_product) -> None:
    make_product(code="TSK-030B/TSK-040B", name="Trusco Box")
    cart = make_product(code="TSK-040B", name="Trusco Cart")
    preview = upload(auth_client, "/api/products/import.xlsx/preview", workbook_bytes(["TSK-040B", "Trusco Cart", "", "", None, None, "", ""]))
    assert [r["product_id"] for r in preview["existing"]] == [cart["id"]]
