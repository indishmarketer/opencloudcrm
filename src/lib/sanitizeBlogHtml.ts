import sanitizeHtml from "sanitize-html";

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "b", "i", "s", "blockquote", "ul", "ol", "li",
      "h2", "h3", "h4", "h5", "h6", "a", "img", "figure", "figcaption", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
      "iframe", "u", "svg", "rect", "line", "polygon", "text",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "class", "id"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "class"],
      td: ["colspan", "rowspan", "class"],
      th: ["colspan", "rowspan", "class"],
      iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "frameborder", "scrolling", "referrerpolicy", "class"],
      svg: ["viewBox", "xmlns", "width", "height", "class", "style"],
      rect: ["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width"],
      line: ["x1", "x2", "y1", "y2", "stroke", "stroke-width"],
      polygon: ["points", "fill", "stroke", "stroke-width"],
      text: ["x", "y", "fill", "font-size", "font-weight", "text-anchor"],
      "*": ["class", "id", "style"],
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https"], iframe: ["https"] },
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "open.spotify.com"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        background: [/^#[0-9a-f]{3,8}$/i],
        width: [/^\d+(?:\.\d+)?(?:px|%|rem|em)?$/],
        height: [/^\d+(?:\.\d+)?(?:px|%|rem|em)?$/],
        margin: [/^[\d .%a-z-]+$/i],
        padding: [/^[\d .%a-z-]+$/i],
        border: [/^[#\d .a-z()-]+$/i],
        "border-radius": [/^\d+(?:\.\d+)?(?:px|%|rem|em)?$/],
        "font-family": [/^[a-z ,"'-]+$/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|rem|em|%)$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "text-align": [/^(?:left|right|center|justify)$/],
      },
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
        },
      }),
    },
  });
}
