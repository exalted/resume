#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const {
  escapeHtml,
  formatInline,
  formatText,
  entry,
  renderRow,
  generateSection,
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

// PDF header: real email/phone as plain links, no obfuscation
function generateHeaderForPdf(data) {
  return `<header class="header">
  <h1>${escapeHtml(data.name)}</h1>
  <div class="contact-info">
    <span class="bold"><a href="mailto:${escapeHtml(data.contact.email)}">${escapeHtml(data.contact.email)}</a></span>
    <span><a href="tel:${escapeHtml(data.contact.phone)}">${escapeHtml(data.contact.phone)}</a></span>
    <span>${formatInline(data.contact.github)}</span>
    <span>${formatInline(data.contact.linkedin)}</span>
    <span>${formatInline(data.contact.location)}</span>
  </div>
</header>\n`;
}

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
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1200 });
  await page.goto("file://" + htmlPath, { waitUntil: "networkidle0" });
  await page.pdf({
    path: path.join(DOCS_DIR, "ali-servet-donmez_resume.pdf"),
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "18mm",
      right: "18mm",
    },
  });
  await browser.close();
  console.log("Generated: docs/ali-servet-donmez_resume.pdf");
  console.log("\nPDF build complete!");
})();
