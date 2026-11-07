(function (root, factory) {
  const renderChatMarkdown = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = renderChatMarkdown;
  }
  if (root) root.renderChatMarkdown = renderChatMarkdown;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  function appendInline(parent, text) {
    const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/gu;
    let offset = 0;
    let match;

    while ((match = pattern.exec(text))) {
      if (match.index > offset) {
        parent.appendChild(document.createTextNode(text.slice(offset, match.index)));
      }

      const tag = match[1] ? "strong" : match[3] ? "em" : "code";
      const content = match[1] ? match[2] : match[3] ? match[4] : match[5];
      const element = document.createElement(tag);
      element.textContent = content;
      parent.appendChild(element);
      offset = pattern.lastIndex;
    }

    if (offset < text.length) {
      parent.appendChild(document.createTextNode(text.slice(offset)));
    }
  }

  function renderChatMarkdown(container, markdown) {
    container.replaceChildren();
    const lines = String(markdown).replace(/\r\n?/gu, "\n").split("\n");
    let paragraph = [];
    let list = null;
    let listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      const element = document.createElement("p");
      appendInline(element, paragraph.join(" "));
      if (element.textContent === "Демонстрационная информация — требует подтверждения") {
        element.className = "chat-disclaimer";
      }
      container.appendChild(element);
      paragraph = [];
    }

    function flushList() {
      if (list) container.appendChild(list);
      list = null;
      listType = null;
    }

    for (const line of lines) {
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u);
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/u);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/u);

      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      if (heading) {
        flushParagraph();
        flushList();
        const element = document.createElement(`h${Math.min(heading[1].length + 2, 6)}`);
        appendInline(element, heading[2]);
        container.appendChild(element);
        continue;
      }

      if (bullet || ordered) {
        flushParagraph();
        const nextType = ordered ? "ol" : "ul";
        if (listType !== nextType) flushList();
        if (!list) {
          list = document.createElement(nextType);
          listType = nextType;
        }
        const item = document.createElement("li");
        appendInline(item, (bullet || ordered)[1]);
        list.appendChild(item);
        continue;
      }

      flushList();
      paragraph.push(line.trim());
    }

    flushParagraph();
    flushList();
  }

  return renderChatMarkdown;
});
