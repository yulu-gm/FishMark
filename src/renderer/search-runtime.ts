import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
} from "@codemirror/search";

export {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
};

export function createFishmarkSearchExtension() {
  return search({
    createPanel: () => {
      const dom = document.createElement("div");

      dom.hidden = true;
      dom.setAttribute("aria-hidden", "true");
      return { dom, top: true };
    }
  });
}
