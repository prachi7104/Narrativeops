from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUTPUT_PATH = Path(__file__).resolve().parent / "ET_Mock_Brand_Guide.pdf"


def _draw_wrapped_lines(pdf: canvas.Canvas, text: str, x: int, y: int, max_chars: int = 95) -> int:
    words = text.split()
    line = ""
    current_y = y

    for word in words:
        candidate = f"{line} {word}".strip()
        if len(candidate) <= max_chars:
            line = candidate
            continue

        pdf.drawString(x, current_y, line)
        current_y -= 16
        line = word

    if line:
        pdf.drawString(x, current_y, line)
        current_y -= 16

    return current_y


def create_mock_brand_guide() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(OUTPUT_PATH), pagesize=letter)
    y = 760

    title = "Economic Times - Editorial and Compliance Guide (Mock)"
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(72, y, title)
    y -= 34

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(72, y, "Section 1: Voice and Tone")
    y -= 20
    pdf.setFont("Helvetica", 11)
    y = _draw_wrapped_lines(
        pdf,
        "Economic Times content must be authoritative, analytical, and accessible. "
        "Do not use casual language or slang in financial reporting.",
        72,
        y,
    )
    y -= 12

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(72, y, "Section 2: Prohibited Language")
    y -= 20
    pdf.setFont("Helvetica", 11)
    y = _draw_wrapped_lines(
        pdf,
        "Do not use the phrase 'guaranteed returns' or 'guaranteed profit' in any article. "
        "Do not describe any investment product as 'risk-free' or 'zero risk'. "
        "Do not use the phrase 'sure thing' when describing investment outcomes. "
        "Never claim a specific return rate without citing the data source and time period.",
        72,
        y,
    )
    y -= 12

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(72, y, "Section 3: Required Disclosures")
    y -= 20
    pdf.setFont("Helvetica", 11)
    y = _draw_wrapped_lines(
        pdf,
        "All mutual fund content must include the AMFI disclaimer: "
        "'Mutual Fund investments are subject to market risks. Please read all scheme related "
        "documents carefully before investing.' "
        "Articles comparing fixed deposits and mutual funds must include both product risk profiles.",
        72,
        y,
    )
    y -= 12

    if y < 120:
        pdf.showPage()
        y = 760

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(72, y, "Section 4: Factual Standards")
    y -= 20
    pdf.setFont("Helvetica", 11)
    _draw_wrapped_lines(
        pdf,
        "Any percentage claim must be cited with the source and measurement period. "
        "Forward-looking statements must use qualifiers: expected, projected, or estimated. "
        "Historical returns must not be presented as indicative of future performance.",
        72,
        y,
    )

    pdf.save()
    print("Mock brand guide created at api/tests/fixtures/ET_Mock_Brand_Guide.pdf")


if __name__ == "__main__":
    create_mock_brand_guide()
