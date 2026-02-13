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

// Convert markdown-like syntax to HTML: *bold* and _italic_
function formatText(text) {
  if (typeof text !== "string") return text;
  let result = escapeHtml(text);
  // Bold: *text* (but not inside words)
  result = result.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  // Italic: _text_ (but not inside words)
  result = result.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Line breaks
  result = result.replace(/\n/g, "<br>");
  return result;
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
  if (row.type === "table") {
    return renderTableRow(row);
  }
  return entry(row.title, row.value);
}

function generateSection(section) {
  let html = `<section>
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
    <span>${escapeHtml(data.contact.location)}</span>
  </div>
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
