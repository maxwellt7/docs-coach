chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Relay overlay-control messages from the side panel to the active
// tab's content scripts. The side panel can't directly message a
// content script — only an extension page or background can.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (
    message.type !== 'DOCS_COACH_RENDER_PINS' &&
    message.type !== 'DOCS_COACH_CLEAR_PINS'
  ) {
    return false;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  });
  return false;
});
