// Popup logic for loading and saving exact-date and date-format preferences with chrome.storage.sync.

(() => {
  const enabledInput = document.getElementById('enabled');
  const formatSelect = document.getElementById('format');

  const loadSettings = async () => {
    const { enabled = true, format = 'long' } = await chrome.storage.sync.get(['enabled', 'format']);
    enabledInput.checked = enabled !== false;
    formatSelect.value = format === 'iso' ? 'iso' : 'long';
  };

  const saveEnabled = async () => {
    await chrome.storage.sync.set({ enabled: enabledInput.checked });
  };

  const saveFormat = async () => {
    const format = formatSelect.value === 'iso' ? 'iso' : 'long';
    await chrome.storage.sync.set({ format });
  };

  const init = async () => {
    enabledInput.addEventListener('change', saveEnabled);
    formatSelect.addEventListener('change', saveFormat);
    await loadSettings();
  };

  void init();
})();
