from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


def write_paragraph(pdf: canvas.Canvas, lines: list[str], top_y: float) -> None:
    text = pdf.beginText(1 * inch, top_y)
    text.setLeading(18)
    text.setFont("Helvetica", 12)
    for line in lines:
        text.textLine(line)
    pdf.drawText(text)


def create_pdf(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4

    # Page 1: Title page
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(1 * inch, height - 1.5 * inch, "Economic Times - Editorial and Compliance Guide")
    pdf.setFont("Helvetica", 14)
    pdf.drawString(1 * inch, height - 2.1 * inch, "Financial Content Standards and Brand Voice")
    pdf.setFont("Helvetica-Oblique", 11)
    pdf.drawString(1 * inch, height - 2.6 * inch, "Version 3.2 | Internal Document")
    pdf.showPage()

    # Page 2: Voice and Tone
    page2_lines = [
        "ET content must be authoritative, analytical, and accessible to Indian readers.",
        "PROHIBITED: Do not use casual language, slang, or click-bait headlines.",
        "Do not use ALL CAPS for emphasis in body text.",
        "Headlines must be factual and not sensationalist.",
    ]
    write_paragraph(pdf, page2_lines, height - 1.5 * inch)
    pdf.showPage()

    # Page 3: Financial Content Rules
    page3_lines = [
        "MANDATORY DISCLAIMER: All mutual fund content must include:",
        "'Mutual fund investments are subject to market risks.",
        "Please read all scheme-related documents carefully before investing.'",
        "",
        "PROHIBITED PHRASES:",
        "- Do not use 'guaranteed returns' or 'assured returns'",
        "- Do not use 'risk-free' or 'zero risk' when describing any investment",
        "- Do not describe any fund as 'the best' without citing a ranked comparison",
        "- Do not use 'sure profit' or 'certain gains'",
        "",
        "FACTUAL STANDARDS:",
        "- Any return percentage must cite the source and measurement period",
        "- Forward-looking statements must include: 'expected', 'projected', or 'estimated'",
        "- Historical returns must include: 'past performance is not indicative of future results'",
        "- Do not compare mutual fund returns with FD rates without specifying the time period",
    ]
    write_paragraph(pdf, page3_lines, height - 1.2 * inch)
    pdf.showPage()

    # Page 4: Localization Standards
    page4_lines = [
        "Hindi content must be culturally adapted, not word-for-word translated.",
        "Financial terms (NAV, SIP, SEBI, NPS, PPF) must be preserved accurately.",
        "Do not replace Indian financial product names with Western equivalents.",
    ]
    write_paragraph(pdf, page4_lines, height - 1.5 * inch)
    pdf.showPage()

    pdf.save()


def main() -> None:
    output_file = Path(__file__).parent / "ET_Mock_Brand_Guide.pdf"
    create_pdf(output_file)
    print("Brand guide PDF created. Run it through Lumina to verify 10+ rules extracted.")


if __name__ == "__main__":
    main()
