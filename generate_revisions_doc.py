import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_revisions_document(filename="Stitch_System_Revisions_Summary.docx"):
    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Document Header
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("STITCH-OPT SYSTEM REVISIONS & UI/UX ENHANCEMENTS")
    run_title.font.name = "Segoe UI"
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(15, 23, 42)

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(14)
    run_sub = sub_p.add_run("Administrative Directory, Design Token Harmonization & Audit Ledger Transparency")
    run_sub.font.name = "Segoe UI"
    run_sub.font.size = Pt(12)
    run_sub.font.bold = True
    run_sub.font.color.rgb = RGBColor(79, 70, 229) # Indigo 600

    intro_p = doc.add_paragraph()
    intro_p.paragraph_format.space_after = Pt(16)
    run_intro = intro_p.add_run(
        "This official revision document details the recent system upgrades implemented across the Stitch-Opt "
        "administration portal. It covers the resolution of interactive button confusion, column realignment, "
        "theme color harmonization, tab segregation, and transparent audit logging for user account mutations."
    )
    run_intro.font.name = "Segoe UI"
    run_intro.font.size = Pt(10)
    run_intro.font.color.rgb = RGBColor(51, 65, 85)

    revisions = [
        {
            "id": "1",
            "title": "Interactive Buttons vs. Static Status Indicators",
            "issue": "Status indicators (Shift Status, Role, Account Status) used rounded pill bubbles and borders identical to clickable buttons, creating user confusion over what could be clicked.",
            "solution": "Converted all static statuses into clean, plain typography without bubbles, background fills, or borders. Retained button styling strictly for actionable controls (Profile, Edit, Disable, Enable).",
            "impact": "Eliminated visual ambiguity and established an immediate, intuitive distinction between passive status text and actionable buttons."
        },
        {
            "id": "2",
            "title": "Action Column Slot Alignment",
            "issue": "Customer rows had 2 action buttons while Staff rows had 3. The use of 'justify-end' caused customer buttons to shift into adjacent columns, creating a jagged appearance.",
            "solution": "Standardized all action buttons into fixed-width slot containers (Profile w-16, Edit w-14, Disable/Enable w-16).",
            "impact": "Every action button across all rows is now vertically grid-aligned, resulting in a neat, professional layout down the entire table."
        },
        {
            "id": "3",
            "title": "Removal of Unwanted Colored Indicator Dots",
            "issue": "Small circular colored dots beside status words added visual clutter and conflicted with the requested minimalist, clean interface design.",
            "solution": "Completely removed all colored dot indicators across both desktop tables and mobile card views.",
            "impact": "Clean, distraction-free typography with status conveyed purely through curated text colors and clear wording."
        },
        {
            "id": "4",
            "title": "Removal of Staff-Only Columns on Customers",
            "issue": "In combined views, customer rows displayed internal operator fields like 'Shift Status: Offline' and 'Assigned Machine: Unassigned', which makes no sense for customers.",
            "solution": "Restricted 'Shift Status' and 'Assigned Machine' strictly to staff accounts. On customer rows, these were replaced with customer-relevant metrics: 'Orders Placed' and 'Lifetime Spend (₱)'.",
            "impact": "Customer records now display relevant commercial data instead of irrelevant internal operator fields."
        },
        {
            "id": "5",
            "title": "Theme Color Harmonization with Stitch-Opt Brand Tokens",
            "issue": "Arbitrary hardcoded Tailwind colors (e.g. amber-400, emerald-400, rose-400, indigo-300) clashed with the central theme palette. Customer roles were rendered in jarring amber/yellow.",
            "solution": "Replaced all arbitrary colors with central design system tokens: Primary (#4f46e5), Secondary (#6366f1), Accent (#3b82f6), Success (#10b981), Danger (#ef4444), and Muted Text (#94a3b8).",
            "impact": "Consistent visual harmony across tables, badges, modals, and buttons throughout the entire administrative suite."
        },
        {
            "id": "6",
            "title": "Segregated 2-Tab Directory (Removed 'All' Tab)",
            "issue": "Mixing internal operators and external customers in a combined 'All' tab forced an awkward compromise in table columns.",
            "solution": "Removed the 'All' tab completely. The personnel registry now cleanly toggles between 'Staff & Operators' and 'Customers', with customized summary metrics for each.",
            "impact": "Zero cross-contamination between internal personnel management and customer relationship management (CRM)."
        },
        {
            "id": "7",
            "title": "Streamlined 7-Column Grid (Removed Bulky Role Column)",
            "issue": "Repeating 'CUSTOMER' on every row was completely redundant, while devoting an entire column on staff for just two roles wasted horizontal screen width.",
            "solution": "Removed the standalone 'Access / Role' column. On the Staff tab, the role (Administrator / Artisan) is rendered neatly right under the username. Both tabs now share a balanced 7-column grid.",
            "impact": "Cleaner typography, greater horizontal breathing room, and zero wasted table columns."
        },
        {
            "id": "8",
            "title": "Audit Trail Target Subject Transparency",
            "issue": "Security logs for account mutations (e.g. TOGGLE_USER_STATUS, ADMIN_PASSWORD_RESET) only showed the actor and a cryptic UUID (e.g. f1374875-2bac-46f5...) without specifying which user was modified.",
            "solution": "Enriched backend API to join and return the target user's username, email, and role (as well as product/order names). Renamed the column to 'Target Subject' and displayed the username and email prominently.",
            "impact": "Administrators can instantly identify the affected user at a glance without having to cross-reference raw UUIDs in the database."
        }
    ]

    # Create Summary Table
    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    col_widths = [Inches(1.8), Inches(2.2), Inches(2.2), Inches(0.8)]
    for i, width in enumerate(col_widths):
        table.columns[i].width = width

    hdr_cells = table.rows[0].cells
    hdr_titles = ["REVISION AREA", "PREVIOUS BEHAVIOR / ISSUE", "ENHANCED SOLUTION", "STATUS"]
    for i, title in enumerate(hdr_titles):
        set_cell_background(hdr_cells[i], "1E293B") # Slate 800
        set_cell_margins(hdr_cells[i], top=140, bottom=140, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(title)
        run.font.name = "Segoe UI"
        run.font.size = Pt(8.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(248, 250, 252)

    for idx, rev in enumerate(revisions):
        row_cells = table.add_row().cells
        bg_color = "F8FAFC" if idx % 2 == 0 else "FFFFFF"

        # Col 0: Area
        set_cell_background(row_cells[0], bg_color)
        set_cell_margins(row_cells[0], top=120, bottom=120, left=140, right=140)
        p0 = row_cells[0].paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(rev["title"])
        r0.font.name = "Segoe UI"
        r0.font.size = Pt(9)
        r0.font.bold = True
        r0.font.color.rgb = RGBColor(15, 23, 42)

        # Col 1: Issue
        set_cell_background(row_cells[1], bg_color)
        set_cell_margins(row_cells[1], top=120, bottom=120, left=140, right=140)
        p1 = row_cells[1].paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(rev["issue"])
        r1.font.name = "Segoe UI"
        r1.font.size = Pt(8.5)
        r1.font.color.rgb = RGBColor(71, 85, 105)

        # Col 2: Solution
        set_cell_background(row_cells[2], bg_color)
        set_cell_margins(row_cells[2], top=120, bottom=120, left=140, right=140)
        p2 = row_cells[2].paragraphs[0]
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(rev["solution"])
        r2.font.name = "Segoe UI"
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = RGBColor(15, 23, 42)

        # Col 3: Status
        set_cell_background(row_cells[3], "DCFCE7" if idx % 2 == 0 else "F0FDF4") # Emerald 100/50
        set_cell_margins(row_cells[3], top=120, bottom=120, left=100, right=100)
        p3 = row_cells[3].paragraphs[0]
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p3.paragraph_format.space_after = Pt(0)
        r3 = p3.add_run("ACTIVE")
        r3.font.name = "Segoe UI"
        r3.font.size = Pt(8)
        r3.font.bold = True
        r3.font.color.rgb = RGBColor(22, 101, 52) # Emerald 800

    # Section 2: Layout Comparisons
    doc.add_paragraph().paragraph_format.space_after = Pt(14)
    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after = Pt(4)
    r_h2 = h2.add_run("STREAMLINED TABLE STRUCTURES (7-COLUMN GRIDS)")
    r_h2.font.name = "Segoe UI"
    r_h2.font.size = Pt(13)
    r_h2.font.bold = True
    r_h2.font.color.rgb = RGBColor(15, 23, 42)

    # Sub-table 1: Staff
    p_t1 = doc.add_paragraph()
    p_t1.paragraph_format.space_after = Pt(4)
    r_t1 = p_t1.add_run("1. Staff & Operators Grid:")
    r_t1.font.name = "Segoe UI"
    r_t1.font.size = Pt(10)
    r_t1.font.bold = True
    r_t1.font.color.rgb = RGBColor(79, 70, 229)

    t_staff = doc.add_table(rows=2, cols=7)
    t_staff.alignment = WD_TABLE_ALIGNMENT.CENTER
    staff_headers = ["Staff & Role", "Contact Info", "Shift Status", "Assigned Machine", "Last Active", "Status", "Actions"]
    for i, h in enumerate(staff_headers):
        cell = t_staff.rows[0].cells[i]
        set_cell_background(cell, "312E81") # Indigo 900
        set_cell_margins(cell, top=100, bottom=100, left=80, right=80)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h)
        r.font.name = "Segoe UI"
        r.font.size = Pt(7.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    sample_staff = [
        "employ\nAdministrator",
        "employee@gmail.com\n09390074055",
        "Offline",
        "2nd Machine",
        "Never",
        "Active",
        "[Profile] [Edit] [Disable]"
    ]
    for i, text in enumerate(sample_staff):
        cell = t_staff.rows[1].cells[i]
        set_cell_background(cell, "F8FAFC")
        set_cell_margins(cell, top=100, bottom=100, left=80, right=80)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(text)
        r.font.name = "Segoe UI"
        r.font.size = Pt(7.5)
        r.font.color.rgb = RGBColor(15, 23, 42)

    # Sub-table 2: Customers
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    p_t2 = doc.add_paragraph()
    p_t2.paragraph_format.space_after = Pt(4)
    r_t2 = p_t2.add_run("2. Customers Grid:")
    r_t2.font.name = "Segoe UI"
    r_t2.font.size = Pt(10)
    r_t2.font.bold = True
    r_t2.font.color.rgb = RGBColor(16, 185, 129)

    t_cust = doc.add_table(rows=2, cols=7)
    t_cust.alignment = WD_TABLE_ALIGNMENT.CENTER
    cust_headers = ["Customer", "Contact Info", "Orders Placed", "Lifetime Spend", "Last Active", "Status", "Actions"]
    for i, h in enumerate(cust_headers):
        cell = t_cust.rows[0].cells[i]
        set_cell_background(cell, "064E3B") # Emerald 900
        set_cell_margins(cell, top=100, bottom=100, left=80, right=80)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h)
        r.font.name = "Segoe UI"
        r.font.size = Pt(7.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    sample_cust = [
        "Carding Baratingting\nLucena City",
        "baratingtingc@gmail.com\nVerified",
        "0 orders",
        "₱0.00",
        "Never",
        "Active",
        "[Profile] [Disable]"
    ]
    for i, text in enumerate(sample_cust):
        cell = t_cust.rows[1].cells[i]
        set_cell_background(cell, "F8FAFC")
        set_cell_margins(cell, top=100, bottom=100, left=80, right=80)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(text)
        r.font.name = "Segoe UI"
        r.font.size = Pt(7.5)
        r.font.color.rgb = RGBColor(15, 23, 42)

    # Footer note
    doc.add_paragraph().paragraph_format.space_after = Pt(14)
    p_foot = doc.add_paragraph()
    r_foot = p_foot.add_run("System Build Verification: Next.js Turbopack build succeeded with 0 errors across all routes. Express backend is connected and healthy.")
    r_foot.font.name = "Segoe UI"
    r_foot.font.size = Pt(8.5)
    r_foot.font.italic = True
    r_foot.font.color.rgb = RGBColor(100, 116, 139)

    doc.save(filename)
    print(f"Document created successfully: {filename}")

if __name__ == "__main__":
    create_revisions_document()
