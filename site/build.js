#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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
  console.error("Error: PII_EMAIL and PII_PHONE environment variables are required.");
  process.exit(1);
}

data.contact.email = PII_EMAIL;
data.contact.phone = PII_PHONE;

const template = fs.readFileSync(
  path.join(SITE_DIR, "template.html"),
  "utf-8"
);

// Obfuscate a string by converting to shifted char codes
function obfuscate(str) {
  const shift = 7;
  return str.split("").map((c) => c.charCodeAt(0) + shift);
}

// Create masked version of email (***@domain.com)
function maskEmail(email) {
  const atIndex = email.indexOf("@");
  if (atIndex > 0) {
    return "***" + email.substring(atIndex);
  }
  return "***";
}

// Create masked version of phone (+39 *** *** 7212)
function maskPhone(phone) {
  // Keep country code and last 4 digits
  const cleaned = phone.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");
  if (parts.length >= 2) {
    const countryCode = parts[0];
    const lastPart = parts[parts.length - 1];
    const lastDigits = lastPart.slice(-4);
    return `${countryCode} *** *** ${lastDigits}`;
  }
  return "*** *** ****";
}

function escapeHtml(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Inline formatting: *bold*, _italic_, [text](url)
function formatInline(text) {
  if (typeof text !== "string") return text;
  let result = escapeHtml(text);
  result = result.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  result = result.replace(/_([^_]+)_/g, "<em>$1</em>");
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return result;
}

// Block formatting: inline formatting + bullet spacing + paragraph/list wrapping
function formatText(text) {
  if (typeof text !== "string") return text;

  const lines = text.split("\n");
  const blocks = [];
  let listItems = [];

  function formatLine(line) {
    return formatInline(line).replace(/ • /g, "\u00a0• ");
  }

  function flushList() {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${formatLine(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  let paragraphLines = [];

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push(`<p>${paragraphLines.join("<br>")}</p>`);
    paragraphLines = [];
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    flushList();

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraphLines.push(formatLine(line));
  }

  flushList();
  flushParagraph();
  return blocks.join("");
}

function entry(label, value) {
  const safeValue =
    typeof value === "string" && !value.includes("<")
      ? formatText(value)
      : value;
  return `<div class="entry">
      <div class="entry-label">${escapeHtml(label)}</div>
      <div class="entry-value">${safeValue}</div>
    </div>`;
}

function renderTableRow(row) {
  let tableHtml = `<table class="data-table">`;
  for (const rowData of row.value) {
    tableHtml += `<tr>${rowData.map((cell) => `<td>${formatText(cell)}</td>`).join("")}</tr>`;
  }
  tableHtml += `</table>`;
  return entry(row.title, tableHtml);
}

function renderRow(row) {
  if (row.type === "simple") {
    return entry(row.title, row.value);
  }
  if (row.type === "table") {
    return renderTableRow(row);
  }
  throw new Error(`Unknown row type: ${row.type}`);
}

function generateSection(section) {
  const layoutClass = "layout-stacked";
  const slugClass = section.title
    ? `section-${section.title.toLowerCase().replace(/\s+/g, "-")}`
    : "section-summary";

  let html = `<section class="${layoutClass} ${slugClass}">
  <h2>${escapeHtml(section.title)}</h2>
  <div class="section-content">\n`;

  for (const block of section.blocks) {
    html += `    <div class="entry-block">\n`;

    for (const row of block.rows) {
      html += `    ${renderRow(row)}\n`;
    }

    html += `    </div>\n`;
  }

  html += `  </div>
</section>\n`;
  return html;
}

function generateHeader(data) {
  const emailObf = JSON.stringify(obfuscate(data.contact.email));
  const phoneObf = JSON.stringify(obfuscate(data.contact.phone));
  const emailMasked = maskEmail(data.contact.email);
  const phoneMasked = maskPhone(data.contact.phone);

  return `<header class="header">
  <h1>${escapeHtml(data.name)}</h1>
  <div class="contact-info">
    <span class="protected bold" data-o="${escapeHtml(emailObf)}" data-type="email" title="Click to reveal">${escapeHtml(emailMasked)}</span>
    <span class="protected" data-o="${escapeHtml(phoneObf)}" data-type="phone" title="Click to reveal">${escapeHtml(phoneMasked)}</span>
    <span>${formatInline(data.contact.github)}</span>
    <span>${formatInline(data.contact.linkedin)}</span>
    <span>${formatInline(data.contact.location)}</span>
  </div>
  <a href="${pdfFilename(data.name)}" download class="pdf-download" aria-label="Download as PDF">
    <span class="pdf-download-icon" aria-hidden="true"></span>
    <span class="pdf-download-label">Download as PDF</span>
  </a>
</header>\n`;
}

// Generate HTML content
function generateContent(data) {
  let html = "";

  // Header (special case - not a section)
  html += generateHeader(data);

  // Sections (generic loop)
  for (const section of data.sections) {
    html += generateSection(section);
  }

  return html;
}

// Derive PDF filename from name: "Ali Servet Donmez" -> "ali-servet-donmez_resume.pdf"
function pdfFilename(name) {
  return name.toLowerCase().replace(/\s+/g, "-") + "_resume.pdf";
}

// Exports for use by other scripts (e.g., build-pdf.js)
module.exports = {
  escapeHtml,
  formatInline,
  formatText,
  entry,
  renderRow,
  renderTableRow,
  generateSection,
  generateContent,
  pdfFilename,
};

if (require.main === module) {
  // Generate output
  const content = generateContent(data);
  let output = template.replace("<!-- CONTENT -->", content);
  output = output.replace("{{NAME}}", escapeHtml(data.name));

  // Ensure docs directory exists
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  // Write output files
  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), output, "utf-8");
  console.log("Generated: docs/index.html");

  // Copy CSS
  fs.copyFileSync(
    path.join(SITE_DIR, "style.css"),
    path.join(DOCS_DIR, "style.css")
  );
  console.log("Copied: docs/style.css");

  console.log("\nBuild complete!");
}
