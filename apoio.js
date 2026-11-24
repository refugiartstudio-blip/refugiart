/* Link permanente para a campanha pessoal de apoio à produção artística. */
document.addEventListener("DOMContentLoaded", () => {
  let footer = document.querySelector("footer");
  if (!footer) {
    footer = document.createElement("footer");
    footer.className = "rodape-apoio-global";
    document.body.appendChild(footer);
  }
  if (footer.querySelector(".link-apoio-global")) return;

  const area = document.createElement("p");
  area.className = "link-apoio-global";
  area.style.cssText = "margin:10px 0 0;text-align:center;font-size:13px;line-height:1.6;";
  const link = document.createElement("a");
  link.href = "https://apoia.se/henriquesousa";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Apoie a produção artística independente ↗";
  link.style.cssText = "color:#d6a45d;font-weight:600;text-decoration:underline;text-underline-offset:3px;";
  area.appendChild(link);
  footer.appendChild(area);
});
