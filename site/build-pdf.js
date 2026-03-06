#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

const {
  escapeHtml,
  formatInline,
  formatText,
  entry,
  renderRow,
  generateSection,
  pdfFilename,
} = require("./build.js");

const SITE_DIR = __dirname;
const DOCS_DIR = path.join(SITE_DIR, "..", "docs");

// Read input files
const data = JSON.parse(
  fs.readFileSync(path.join(SITE_DIR, "data.json"), "utf-8")
);

// Require PII from environment variables
const PII_EMAIL = process.env.PII_EMAIL;
const PII_PHONE = process.env.PII_PHONE;

if (!PII_EMAIL || !PII_PHONE) {
  console.error(
    "Error: PII_EMAIL and PII_PHONE environment variables are required."
  );
  process.exit(1);
}

data.contact.email = PII_EMAIL;
data.contact.phone = PII_PHONE;

const template = fs.readFileSync(
  path.join(SITE_DIR, "template.html"),
  "utf-8"
);

// Extract skills keywords from data for PDF metadata
function extractKeywords(data) {
  const keywords = [];
  for (const section of data.sections) {
    if (section.title === "Skills") {
      for (const block of section.blocks) {
        for (const row of block.rows) {
          if (row.type === "table") {
            for (const tableRow of row.value) {
              // tableRow[1] contains the skills text
              const skills = tableRow[1]
                .replace(/_([^_]+)_/g, "$1") // strip markdown italic
                .split(" • ");
              keywords.push(...skills);
            }
          } else if (row.type === "simple") {
            const skills = row.value
              .replace(/_([^_]+)_/g, "$1")
              .split(" • ");
            keywords.push(...skills);
          }
        }
      }
    }
  }
  return keywords.map((k) => k.trim()).filter(Boolean);
}

// Extract a short professional title from experience data
function extractTitle(data) {
  for (const section of data.sections) {
    if (section.title === "Experience") {
      for (const block of section.blocks) {
        for (const row of block.rows) {
          if (row.type === "simple" && row.value.startsWith("*")) {
            // Extract first bold text as title
            const match = row.value.match(/\*([^*]+)\*/);
            if (match) return match[1];
          }
        }
      }
    }
  }
  return data.name;
}

// PDF header: real email/phone as plain links, wrapped in <address> for semantics
function generateHeaderForPdf(data) {
  return `<header class="header">
  <h1>${escapeHtml(data.name)}</h1>
  <address class="contact-info">
    <span class="bold"><a href="mailto:${escapeHtml(data.contact.email)}">${escapeHtml(data.contact.email)}</a></span>
    <span><a href="tel:${escapeHtml(data.contact.phone)}">${escapeHtml(data.contact.phone)}</a></span>
    <span>${formatInline(data.contact.github)}</span>
    <span>${formatInline(data.contact.linkedin)}</span>
    <span>${formatInline(data.contact.location)}</span>
  </address>
</header>\n`;
}

const keywords = extractKeywords(data);
const professionalTitle = extractTitle(data);

// Generate full HTML content for PDF
let html = "";
html += generateHeaderForPdf(data);
for (const section of data.sections) {
  html += generateSection(section);
}

// Build full page HTML
let output = template.replace("<!-- CONTENT -->", html);
output = output.replace("{{NAME}}", escapeHtml(data.name));

// Strip <script> block (no JS needed in PDF)
output = output.replace(/<script>[\s\S]*?<\/script>/, "");

// Inject meta tags before </head>
const metaTags = `
  <meta name="author" content="${escapeHtml(data.name)}">
  <meta name="description" content="${escapeHtml(data.name)} - ${escapeHtml(professionalTitle)}">
  <meta name="keywords" content="${escapeHtml(keywords.join(", "))}">`;
output = output.replace("</head>", metaTags + "\n</head>");

// Inject PDF-override CSS before </head>
const pdfCss = `<style>
  /* PDF overrides */
  p, li { page-break-inside: avoid; }
  .entry {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .entry-label,
  .entry-value {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  a[href]::after { display: none !important; }
  .pdf-download { display: none !important; }
  body { background: #fff; font-size: 12px; line-height: 1.4; }
  .container { padding: 0; }
  .header { margin-bottom: 24px; }
  .header h1 { font-size: 1.8rem; }
  .contact-info { font-size: 0.95rem; }
  address.contact-info { font-style: normal; }
  section { margin-bottom: 16px; }
  section h2 { font-size: 1.3rem; margin-bottom: 8px; }
  .entry-block { margin-bottom: 20px; }
</style>`;
output = output.replace("</head>", pdfCss + "\n</head>");

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Save intermediate HTML for debugging
const htmlPath = path.join(DOCS_DIR, "resume-pdf-debug.html");
fs.writeFileSync(htmlPath, output, "utf-8");
console.log("Generated: docs/resume-pdf-debug.html");

// Generate PDF
const pdfPath = path.join(DOCS_DIR, pdfFilename(data.name));

(async () => {
  const browser = await puppeteer.launch({
    args: process.env.CI ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1200 });
  await page.goto("file://" + htmlPath, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    tagged: true,
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "18mm",
      right: "18mm",
    },
  });
  await browser.close();
  console.log(`Generated: docs/${pdfFilename(data.name)}`);

  // Post-process PDF to set metadata
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  pdfDoc.setTitle(`${data.name} - Resume`);
  pdfDoc.setAuthor(data.name);
  pdfDoc.setSubject(professionalTitle);
  pdfDoc.setKeywords(keywords);
  pdfDoc.setCreator(`${data.name}`);
  pdfDoc.setProducer(`${data.name} Resume Builder`);

  const updatedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, updatedPdfBytes);
  console.log("Set PDF metadata (title, author, subject, keywords)");

  // Linearize (optimize for web) using qpdf
  const linearizedPath = pdfPath.replace(/\.pdf$/, "-linearized.pdf");
  execFileSync("qpdf", ["--linearize", pdfPath, linearizedPath]);
  fs.renameSync(linearizedPath, pdfPath);
  console.log("Linearized PDF");

  console.log("\nPDF build complete!");
})();
