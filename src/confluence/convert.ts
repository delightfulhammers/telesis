/** Convert Confluence storage format (XHTML subset) to markdown. */

/** Strip HTML tags and convert common Confluence elements to markdown. */
export const storageToMarkdown = (html: string): string => {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  // Bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // Code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // Code blocks (Confluence structured macro)
  md = md.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:plain-text-body>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/ac:plain-text-body>\s*<\/ac:structured-macro>/gis,
    "```\n$1\n```\n\n",
  );

  // Preformatted
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, "```\n$1\n```\n\n");

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Unordered lists
  md = md.replace(/<ul[^>]*>/gi, "");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

  // Ordered lists
  md = md.replace(/<ol[^>]*>/gi, "");
  md = md.replace(/<\/ol>/gi, "\n");

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n");

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Horizontal rules
  md = md.replace(/<hr\s*\/?>/gi, "---\n\n");

  // Tables (basic — Confluence tables are complex)
  md = md.replace(/<table[^>]*>/gi, "\n");
  md = md.replace(/<\/table>/gi, "\n");
  md = md.replace(/<tr[^>]*>/gi, "| ");
  md = md.replace(/<\/tr>/gi, "\n");
  md = md.replace(/<th[^>]*>(.*?)<\/th>/gi, "$1 | ");
  md = md.replace(/<td[^>]*>(.*?)<\/td>/gi, "$1 | ");
  md = md.replace(/<thead[^>]*>/gi, "");
  md = md.replace(/<\/thead>/gi, "");
  md = md.replace(/<tbody[^>]*>/gi, "");
  md = md.replace(/<\/tbody>/gi, "");

  // Strip remaining Confluence macros
  md = md.replace(/<ac:[^>]*\/>/gi, "");
  md = md.replace(/<ac:[^>]*>.*?<\/ac:[^>]*>/gis, "");
  md = md.replace(/<ri:[^>]*\/>/gi, "");
  md = md.replace(/<ri:[^>]*>.*?<\/ri:[^>]*>/gis, "");

  // Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md;
};
