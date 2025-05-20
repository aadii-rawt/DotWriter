let activeElement = null;
let controller = null;

// -- Shortcut Listener for "--"
document.addEventListener('keyup', (e) => {
  const target = e.target;

  // ✅ Ignore inside popup
  if (target?.dataset?.ignoreAi) return;

  const isInput = target instanceof HTMLInputElement;
  const isTextarea = target instanceof HTMLTextAreaElement;
  const isContentEditable = target.isContentEditable;

  if (!(isInput || isTextarea || isContentEditable)) return;

  let value = '';
  let cursorPos = 0;

  if (isInput || isTextarea) {
    value = target.value;
    cursorPos = target.selectionStart;
  } else if (isContentEditable) {
    const selection = window.getSelection();
    if (!selection || !selection.focusNode) return;
    value = selection.focusNode.textContent || '';
    cursorPos = selection.focusOffset;
  }

  // ✅ Trigger only if last 2 characters are `--`
  if (value.substring(cursorPos - 2, cursorPos) === '--') {
    if (document.querySelector('#compose-prompt-box')) return;
    activeElement = target;
    showFloatingPrompt(target);
  }
});

function showFloatingPrompt(target) {
  const rect = target.getBoundingClientRect();
  const old = document.querySelector('#compose-prompt-box');
  if (old) old.remove();

  const box = document.createElement('div');
  box.id = 'compose-prompt-box';
  const logo = chrome.runtime.getURL('logo.png');

  box.innerHTML = `
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .compose-ai-popup {
        background: white;
        border-radius: 10px;
        padding: 12px;
        width: 320px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        border: 1px solid #ccc;
        font-family: "Segoe UI", sans-serif;
      }
      .compose-ai-loading, .popup-content {
        display: none;
        align-items: center;
        gap: 10px;
      }
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #ccc;
        border-top: 2px solid #333;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-left: auto;
      }
      #compose-prompt-input {
        width: 100%;
        height: 80px;
        resize: none;
        font-size: 13px;
        padding: 6px 8px;
        border-radius: 6px;
        outline: none;
        border: 1px solid #ddd;
        box-sizing: border-box;
      }
      .popup-container {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
      }
    </style>

    <div class="compose-ai-popup">
      <div class="compose-ai-loading">
        <img src="${logo}" style="height: 20px;" />
        <span>Hit <kbd>Esc</kbd> to cancel</span>
        <div class="spinner"></div>
      </div>
      <div class="popup-content popup-container">
        <img src="${logo}" style="height: 20px;" />
      <textarea id="compose-prompt-input" data-ignore-ai="true" placeholder="Type your request and press Enter..."></textarea>

      </div>
    </div>`;

  box.style.position = 'fixed';
  box.style.top = `${rect.top + window.scrollY + rect.height + 10}px`;
  box.style.left = `${rect.left + window.scrollX}px`;
  box.style.zIndex = '9999';

  document.body.appendChild(box);

  const textarea = box.querySelector('#compose-prompt-input');
  const loadingBox = box.querySelector('.compose-ai-loading');
  const inputBox = box.querySelector('.popup-content');

  inputBox.style.display = "flex";
  textarea.focus();

  textarea.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const prompt = textarea.value.trim();
      if (prompt) {
        inputBox.style.display = "none";
        loadingBox.style.display = "flex";
        controller = new AbortController();
        const response = await getResponse(prompt, controller);
        if (response !== '__ABORTED__') {
          insertResponse(response);
        }
        cleanupPopup();
      }
    } else if (e.key === 'Escape') {
      if (controller) controller.abort();
      cleanupPopup();
    }
  });
}

function cleanupPopup() {
  const popup = document.querySelector('#compose-prompt-box');
  if (popup) popup.remove();
  activeElement = null;
  controller = null;
}

async function getResponse(prompt, controller) {
  const apiKey = "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";

  try {
    const fetchOptions = {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    };

    // 👇 Only add controller.signal if controller exists
    if (controller?.signal) {
      fetchOptions.signal = controller.signal;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", fetchOptions);

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "⚠️ No response";
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log("Fetch aborted.");
      return "__ABORTED__";
    }
    console.error("AI Error:", err);
    return "⚠️ Error generating response.";
  }
}


function insertResponse(response) {
  if (!activeElement) return;
  const cursorPos = activeElement.selectionStart;
  const value = activeElement.value;
  const before = value.slice(0, cursorPos - 2); // Remove `--`
  const after = value.slice(cursorPos);
  activeElement.value = before + response + after;
  activeElement.selectionStart = activeElement.selectionEnd = (before + response).length;
}

// 👇 Show "Write with AI" button on textarea focus
document.addEventListener('focusin', (e) => {
  const target = e.target;

  const isValid =
    (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ||
     target.isContentEditable);

  if (!isValid || target.dataset.hasAiButton || target.dataset.ignoreAi) return;

  showAiButton(target);
  target.dataset.hasAiButton = "true";
});


function getCleanPageContext() {
  const EXCLUDE_SELECTORS = [
    'header', 'nav', 'footer',
    '[class*="header"]', '[class*="footer"]',
    '[class*="nav"]', '[class*="banner"]',
    '[class*="sidebar"]', '[class*="alert"]',
    '[role="banner"]', '[role="navigation"]', '[role="alert"]'
  ];

  const elements = Array.from(document.querySelectorAll('body *'));

  const cleanTextBlocks = elements
    .filter(el => {
      return !EXCLUDE_SELECTORS.some(sel => el.closest(sel)) &&
             el.offsetParent !== null &&
             el.innerText?.trim().length > 30;
    })
    .map(el => el.innerText.trim())
    .slice(0, 10); // limit to top 10 meaningful blocks

  return cleanTextBlocks.join('\n\n');
}



// Inject required loader styles
const styleTag = document.createElement('style');
styleTag.innerHTML = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.ai-loader {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid #ccc;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-family: "Segoe UI", sans-serif;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  position: absolute;
  z-index: 9999;
}
.ai-loader .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ccc;
  border-top: 2px solid #333;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-left: auto;
}`;
document.head.appendChild(styleTag);

function extractContext(textarea) {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map(el => el.innerText.trim())
    .filter(Boolean);

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map(el => el.innerText.trim())
    .filter(Boolean);

  const preformatted = Array.from(document.querySelectorAll('pre'))
    .map(el => el.innerText.trim())
    .filter(Boolean);

  const placeholder = textarea.getAttribute('placeholder') || '';
  const ariaLabel = textarea.getAttribute('aria-label') || '';
  const label = document.querySelector(`label[for="${textarea.id}"]`)?.innerText || '';

  // ✅ Nearby validation text
  const hints = Array.from(textarea.parentNode?.querySelectorAll('.hint, .form-note, .note, small') || [])
    .map(el => el.innerText.trim())
    .filter(Boolean)
    .join('\n');

  // ✅ Input length constraints
  const minLength = textarea.getAttribute('minlength');
  const maxLength = textarea.getAttribute('maxlength');
  const required = textarea.hasAttribute('required');

  const validationRules = `
Validation Rules:
${label ? 'Label: ' + label : ''}
${placeholder ? 'Placeholder: ' + placeholder : ''}
${ariaLabel ? 'Aria-Label: ' + ariaLabel : ''}
${hints ? 'Hints: ' + hints : ''}
${minLength ? 'MinLength: ' + minLength : ''}
${maxLength ? 'MaxLength: ' + maxLength : ''}
${required ? 'This field is required.' : ''}
`;

const cleanedPageText = getCleanPageContext();

const contextText = `
Page Context:
${cleanedPageText}

${validationRules}
`;


  return {
    type: "smart content",
    details: contextText
  };
}


function showAiButton(textarea) {
  const logo = chrome.runtime.getURL('logo.png');

  const button = document.createElement('button');
  button.textContent = "✍️ Write with AI";
  button.style.position = "absolute";
  button.style.top = `${textarea.offsetTop + textarea.offsetHeight - 30}px`;
  button.style.left = `${textarea.offsetLeft + textarea.offsetWidth - 120}px`;
  button.style.zIndex = 9999;
  button.style.padding = "6px 10px";
  button.style.fontSize = "12px";
  button.style.border = "1px solid #888";
  button.style.background = "#f0f0f0";
  button.style.borderRadius = "4px";
  button.style.cursor = "pointer";

  const loader = document.createElement('div');
  loader.className = 'ai-loader';
  loader.style.display = 'none';
  loader.innerHTML = `
    <img src="${logo}" style="height: 20px;" />
    <span>Writing with AI... <kbd>Esc</kbd> to cancel</span>
    <div class="spinner"></div>
  `;
  loader.style.position = "absolute";
  loader.style.top = `${textarea.offsetTop + textarea.offsetHeight - 30}px`;
  loader.style.left = `${textarea.offsetLeft + textarea.offsetWidth - 200}px`;
  loader.style.zIndex = 9999;

  button.addEventListener('click', async () => {
    const context = extractContext(textarea);

    const prompt = `
You are a professional AI writing assistant.

Below is the context from the webpage, including project requirements and form validation rules.
Use it to generate a response that:

- Matches the intent (e.g., proposal, review, comment)
- Covers all important points from the description
- Fulfills input requirements (e.g., minimum 100 characters)
- Sounds natural and helpful

Context:
${context.details}

Only return the final response. Do not include explanation.
`;


    controller = new AbortController();
    button.style.display = "none";
    loader.style.display = "flex";
    document.body.appendChild(loader);

    const result = await getResponse(prompt, controller);
    if (result !== '__ABORTED__') {
      textarea.value = result;
    }

    loader.remove();
    button.remove();
  });

  document.body.appendChild(button);

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.body.contains(button)) button.remove();
    }, 300);
  });
}
