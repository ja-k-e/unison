import { Unison } from "./Unison.js";

document.addEventListener("click", () => {
  if (!window.initialized) {
    initialize();
    window.initialized = true;
  }
});

async function initialize() {
  const unison = new Unison();
  await unison.initialize();
}
