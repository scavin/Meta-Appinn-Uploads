const SELECTORS = {
  replyControl: '#reply-control',
  toolbar: '.d-editor-button-bar',
  uploadButton: '.toolbar__button.upload',
  textarea: 'textarea.d-editor-input',
  proseMirror: '.ProseMirror-container .ProseMirror.d-editor-input',
};

const CONTENT_FORMAT = {
  before: '\n',
  after: '\n\n',
};

const SUPPORTED_MIME_TYPES = {
  image: {
    test: (type) => type.startsWith('image/'),
    format: (filename, url) => `![${filename}](${url})`,
    accept: 'image/*',
  },
  video: {
    test: (type) => type.startsWith('video/'),
    format: (filename, url) => `![${filename}|video](${url})`,
    accept: 'video/*',
  },
  audio: {
    test: (type) => type.startsWith('audio/'),
    format: (filename, url) => `![${filename}|audio](${url})`,
    accept: 'audio/*',
  },
  pdf: {
    test: (type) => type === 'application/pdf',
    format: (filename, url) => `[${filename}|attachment](${url})`,
    accept: '.pdf',
  },
};

function buildConfig(siteSettings) {
  return {
    debug: !!siteSettings.appinn_upload_debug,
    maxFileSize: Math.max(1, Number(siteSettings.appinn_upload_max_file_size_mb || 20)) * 1024 * 1024,
    uploadEndpoint: siteSettings.appinn_upload_endpoint,
    assetsPrefix: siteSettings.appinn_upload_assets_prefix,
    uploadParams: {
      authCode: siteSettings.appinn_upload_auth_code,
      serverCompress: siteSettings.appinn_upload_server_compress,
      uploadChannel: siteSettings.appinn_upload_channel,
      uploadNameType: siteSettings.appinn_upload_name_type,
      autoRetry: siteSettings.appinn_upload_auto_retry,
      returnFormat: siteSettings.appinn_upload_return_format,
      uploadFolder: siteSettings.appinn_upload_folder,
    },
    apiToken: siteSettings.appinn_upload_api_token,
  };
}

function createLogger(enabled) {
  return {
    log(...args) {
      if (enabled) {
        console.log('[AppinnUpload]', ...args);
      }
    },
    error(...args) {
      if (enabled) {
        console.error('[AppinnUpload]', ...args);
      }
    },
  };
}

const MarkdownFormatter = {
  getPlaceholderText(file, uploadId) {
    const fileType = FileUtils.getFileType(file);
    const prefix = fileType === 'image' || fileType === 'video' || fileType === 'audio' ? '!' : '';
    const suffix =
      fileType === 'video'
        ? '|video'
        : fileType === 'audio'
        ? '|audio'
        : fileType === 'pdf'
        ? '|attachment'
        : '';
    return `${prefix}[上传中...${uploadId}${suffix}]`;
  },

  getFailureText(uploadId, errorType) {
    const map = {
      network: '网络错误',
      server: '服务器错误',
      permission: '权限错误',
      format: '格式错误',
      filetype: '类型不支持',
      filesize: '文件过大',
      unknown: '未知错误',
    };
    const errorLabel = map[errorType] || map.unknown;
    return `[上传失败(${errorLabel})-${uploadId}]`;
  },

  getMarkdownLink(file, url) {
    const fileType = FileUtils.getFileType(file);
    const filename = file.name || `file_${Date.now()}`;
    if (fileType && SUPPORTED_MIME_TYPES[fileType]) {
      return SUPPORTED_MIME_TYPES[fileType].format(filename, url);
    }
    return `[${filename}](${url})`;
  },

  formatContent(content) {
    return CONTENT_FORMAT.before + content + CONTENT_FORMAT.after;
  },
};

const FileUtils = {
  getFileType(file) {
    const { type = '' } = file || {};
    const entry = Object.entries(SUPPORTED_MIME_TYPES).find(([, info]) => info.test(type));
    return entry ? entry[0] : null;
  },

  validateFile(file, maxSize) {
    const fileType = this.getFileType(file);
    if (!fileType) {
      return { valid: false, error: 'filetype' };
    }
    if (file.size > maxSize) {
      return { valid: false, error: 'filesize' };
    }
    return { valid: true, error: null };
  },

  getFileFromClipboard(clipboardData) {
    if (!clipboardData?.items) {
      return null;
    }
    for (const item of clipboardData.items) {
      if (item.kind === 'file') {
        return item.getAsFile();
      }
    }
    return null;
  },

  hasFileInDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }
    if (dataTransfer.items?.length) {
      return [...dataTransfer.items].some((item) => item.kind === 'file');
    }
    if (dataTransfer.types?.includes('Files')) {
      return true;
    }
    return dataTransfer.files?.length > 0;
  },

  generateAcceptString() {
    return Object.values(SUPPORTED_MIME_TYPES)
      .map((info) => info.accept)
      .join(',');
  },
};

class EditorAdapter {
  constructor(element) {
    this.element = element;
  }

  get type() {
    return 'base';
  }

  get eventTarget() {
    return this.element;
  }

  isUsable() {
    return !!this.element?.isConnected;
  }

  focus() {
    if (this.element?.focus) {
      this.element.focus();
    }
  }
}

class TextareaAdapter extends EditorAdapter {
  get type() {
    return 'textarea';
  }

  insertPlaceholder(completeText) {
    const editor = this.element;
    const { selectionStart, selectionEnd, scrollTop, value } = editor;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    editor.value = before + completeText + after;
    const cursor = before.length + completeText.length;
    editor.selectionStart = cursor;
    editor.selectionEnd = cursor;
    editor.scrollTop = scrollTop;
    this._triggerInput();
  }

  replacePlaceholder(placeholderText, replacementText) {
    const editor = this.element;
    const currentText = editor.value;
    const index = currentText.indexOf(placeholderText);

    if (index === -1) {
      return false;
    }

    editor.value =
      currentText.slice(0, index) + replacementText + currentText.slice(index + placeholderText.length);
    const cursor = index + replacementText.length;
    editor.selectionStart = cursor;
    editor.selectionEnd = cursor;
    this._triggerInput();
    return true;
  }

  appendContent(content) {
    const editor = this.element;
    let currentText = editor.value || '';
    if (currentText.length > 0 && !currentText.endsWith('\n')) {
      currentText += '\n';
    }
    currentText += MarkdownFormatter.formatContent(content);
    editor.value = currentText;
    editor.selectionStart = currentText.length;
    editor.selectionEnd = currentText.length;
    this._triggerInput();
  }

  _triggerInput() {
    const event = new Event('input', { bubbles: true });
    this.element.dispatchEvent(event);
  }
}

class ProseMirrorAdapter extends EditorAdapter {
  get type() {
    return 'prosemirror';
  }

  insertPlaceholder(completeText) {
    this.focus();
    this._insertText(completeText);
  }

  replacePlaceholder(placeholderText, replacementText) {
    const match = this._findPlaceholderRange(placeholderText);
    if (!match) {
      return false;
    }

    const { node, start, end } = match;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    range.deleteContents();

    const textNode = document.createTextNode(replacementText);
    range.insertNode(textNode);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const afterRange = document.createRange();
      afterRange.setStart(textNode, textNode.length);
      afterRange.setEnd(textNode, textNode.length);
      selection.addRange(afterRange);
    }

    this._triggerInput();
    return true;
  }

  appendContent(content) {
    this.focus();
    this._moveCaretToEnd();
    this._insertText(MarkdownFormatter.formatContent(content));
  }

  _moveCaretToEnd() {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(this.element);
    range.collapse(false);
    selection.addRange(range);
  }

  _insertText(text) {
    const execSupported =
      typeof document.execCommand === 'function' &&
      document.queryCommandSupported &&
      document.queryCommandSupported('insertText');

    if (execSupported) {
      document.execCommand('insertText', false, text);
    } else {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        this.element.append(text);
      } else {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    this._triggerInput();
  }

  _findPlaceholderRange(placeholderText) {
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const idx = node.nodeValue.indexOf(placeholderText);
      if (idx !== -1) {
        return { node, start: idx, end: idx + placeholderText.length };
      }
      node = walker.nextNode();
    }
    return null;
  }

  _triggerInput() {
    try {
      const event = new InputEvent('input', { bubbles: true });
      this.element.dispatchEvent(event);
    } catch (error) {
      const fallback = new Event('input', { bubbles: true });
      this.element.dispatchEvent(fallback);
    }
  }
}

class UploadController {
  constructor(api, config, logger) {
    this.api = api;
    this.config = config;
    this.logger = logger;
    this.uploads = new Map();
    this.currentContext = null;
    this.cleanupFns = [];
    this.replyObserver = null;
    this.bodyObserver = null;
  }

  init() {
    const container = this.api.container;
    this.appEvents = container.lookup('service:app-events');
    this.onComposerOpened = () => this.ensureComposerBindings();
    this.onComposerClosed = () => this.resetComposerBindings();

    this.appEvents.on('composer:opened', this.onComposerOpened);
    this.appEvents.on('composer:recovered', this.onComposerOpened);
    this.appEvents.on('composer:destroyed', this.onComposerClosed);
    this.appEvents.on('composer:closed', this.onComposerClosed);

    this.setupBodyObserver();
    this.ensureComposerBindings();
  }

  setupBodyObserver() {
    if (this.bodyObserver) {
      this.bodyObserver.disconnect();
    }
    this.bodyObserver = new MutationObserver(() => this.ensureComposerBindings());
    this.bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  ensureComposerBindings() {
    const context = this.findContext();
    if (!context) {
      this.resetComposerBindings();
      return;
    }

    if (this.currentContext?.editorElement === context.editorElement) {
      return;
    }

    this.resetComposerBindings();
    this.currentContext = context;
    this.logger.log('Composer ready (mode: %s)', context.adapter.type);

    if (this.replyObserver) {
      this.replyObserver.disconnect();
    }
    this.replyObserver = new MutationObserver(() => this.ensureComposerBindings());
    this.replyObserver.observe(context.replyControl, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });

    this.registerListeners(context);
  }

  resetComposerBindings() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns.length = 0;
    this.currentContext = null;

    if (this.replyObserver) {
      this.replyObserver.disconnect();
      this.replyObserver = null;
    }
  }

  findContext() {
    const replyControl = document.querySelector(SELECTORS.replyControl);
    if (!replyControl || replyControl.classList.contains('closed')) {
      return null;
    }

    const proseMirrorElement = replyControl.querySelector(SELECTORS.proseMirror);
    if (proseMirrorElement) {
      return {
        replyControl,
        editorElement: proseMirrorElement,
        toolbar: replyControl.querySelector(SELECTORS.toolbar),
        uploadButton: replyControl.querySelector(SELECTORS.uploadButton),
        adapter: new ProseMirrorAdapter(proseMirrorElement),
      };
    }

    const textarea = replyControl.querySelector(SELECTORS.textarea);
    if (textarea) {
      return {
        replyControl,
        editorElement: textarea,
        toolbar: replyControl.querySelector(SELECTORS.toolbar),
        uploadButton: replyControl.querySelector(SELECTORS.uploadButton),
        adapter: new TextareaAdapter(textarea),
      };
    }

    return null;
  }

  registerListeners(context) {
    const adapter = context.adapter;
    const pasteHandler = (event) => this.handlePaste(event, adapter);
    const dropHandler = (event) => this.handleDrop(event, adapter);
    const dragOverHandler = (event) => this.handleDragOver(event);

    this.addListener(adapter.eventTarget, 'paste', pasteHandler, { capture: true });
    this.addListener(adapter.eventTarget, 'drop', dropHandler, true);
    this.addListener(adapter.eventTarget, 'dragover', dragOverHandler, true);

    if (context.replyControl && context.replyControl !== adapter.eventTarget) {
      this.addListener(context.replyControl, 'drop', dropHandler, true);
      this.addListener(context.replyControl, 'dragover', dragOverHandler, true);
    }

    if (context.uploadButton) {
      const uploadButtonHandler = (event) => this.handleUploadButton(event, adapter);
      this.addListener(context.uploadButton, 'click', uploadButtonHandler, true);
      context.uploadButton.style.display = 'inline-flex';
    }
  }

  addListener(target, type, handler, options) {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler, options);
    this.cleanupFns.push(() => {
      target.removeEventListener(type, handler, options);
    });
  }

  handlePaste(event, adapter) {
    const file = FileUtils.getFileFromClipboard(event.clipboardData);
    if (!file) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.processFiles([file], adapter);
  }

  handleDrop(event, adapter) {
    if (!FileUtils.hasFileInDataTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files ? [...event.dataTransfer.files] : [];
    this.processFiles(files, adapter);
  }

  handleDragOver(event) {
    if (FileUtils.hasFileInDataTransfer(event.dataTransfer)) {
      event.preventDefault();
    }
  }

  handleUploadButton(event, adapter) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = FileUtils.generateAcceptString();
    input.addEventListener('change', () => {
      if (input.files?.length) {
        this.processFiles([...input.files], adapter);
      }
    });

    input.click();
    this.cleanupFns.push(() => input.remove());
  }

  processFiles(files, adapter) {
    if (!files?.length || !adapter?.isUsable()) {
      return;
    }
    files.forEach((file) => this.uploadFile(file, adapter));
  }

  uploadFile(file, adapter) {
    const validation = FileUtils.validateFile(file, this.config.maxFileSize);
    if (!validation.valid) {
      alert(this.buildFileErrorMessage(file, validation.error));
      this.logger.log('File rejected (%s): %s', validation.error, file.name);
      return;
    }

    const uploadId = generateUploadId();
    const placeholderText = MarkdownFormatter.getPlaceholderText(file, uploadId);
    const completePlaceholder = MarkdownFormatter.formatContent(placeholderText);

    adapter.focus();
    adapter.insertPlaceholder(completePlaceholder);

    this.uploads.set(uploadId, {
      adapter,
      placeholderText,
      file,
    });

    this.logger.log('Upload started: %s', uploadId);

    this.performUpload(file)
      .then((result) => {
        const markdown = MarkdownFormatter.getMarkdownLink(file, result.url);
        this.replacePlaceholder(uploadId, placeholderText, markdown);
        this.logger.log('Upload succeeded: %s', uploadId);
      })
      .catch((error) => {
        this.logger.error('Upload failed:', error);
        const errorType = this.categorizeError(error);
        const failureText = MarkdownFormatter.getFailureText(uploadId, errorType);
        this.replacePlaceholder(uploadId, placeholderText, failureText);
      })
      .finally(() => {
        this.uploads.delete(uploadId);
      });
  }

  replacePlaceholder(uploadId, placeholderText, replacementText) {
    const entry = this.uploads.get(uploadId);
    const adaptersToTry = [];

    if (entry?.adapter?.isUsable()) {
      adaptersToTry.push(entry.adapter);
    }
    if (this.currentContext?.adapter && this.currentContext.adapter !== entry?.adapter) {
      adaptersToTry.push(this.currentContext.adapter);
    }

    for (const adapter of adaptersToTry) {
      if (adapter.replacePlaceholder(placeholderText, replacementText)) {
        return;
      }
    }

    // Fallback append
    const fallbackAdapter = this.currentContext?.adapter || entry?.adapter;
    if (fallbackAdapter?.isUsable()) {
      fallbackAdapter.appendContent(replacementText);
    }
  }

  performUpload(file) {
    const formData = new FormData();
    const filename = file.name || `file_${Date.now()}`;
    formData.append('file', file);

    const params = new URLSearchParams();
    Object.entries(this.config.uploadParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      if (typeof value === 'boolean') {
        params.set(key, value ? 'true' : 'false');
      } else {
        params.set(key, value);
      }
    });

    const search = params.toString();
    const uploadUrl = search
      ? `${this.config.uploadEndpoint}?${search}`
      : this.config.uploadEndpoint;

    const headers = {};
    if (this.config.apiToken) {
      headers.Authorization = this.config.apiToken.startsWith('Bearer ')
        ? this.config.apiToken
        : `Bearer ${this.config.apiToken}`;
    }

    return fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      credentials: 'omit',
      headers,
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error('解析响应数据失败');
      }

      const src = Array.isArray(data) ? data[0]?.src : data?.data?.[0]?.src ?? data?.src;
      if (!src) {
        throw new Error('无效的响应数据');
      }

      return {
        url: this.normalizeUrl(src),
        filename,
      };
    });
  }

  normalizeUrl(src) {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    return `${this.config.assetsPrefix}${src}`;
  }

  categorizeError(error) {
    const message = (error && error.message ? error.message : String(error || '')).toLowerCase();
    if (message.includes('network') || message.includes('failed to fetch')) {
      return 'network';
    }
    if (message.includes('401') || message.includes('403') || message.includes('permission')) {
      return 'permission';
    }
    if (message.includes('500') || message.includes('503') || message.includes('server')) {
      return 'server';
    }
    if (message.includes('format') || message.includes('解析')) {
      return 'format';
    }
    if (message.includes('filetype')) {
      return 'filetype';
    }
    if (message.includes('filesize')) {
      return 'filesize';
    }
    return 'unknown';
  }

  buildFileErrorMessage(file, errorType) {
    if (errorType === 'filetype') {
      return `不支持的文件类型: ${file.type || '未知'}`;
    }
    if (errorType === 'filesize') {
      return `文件"${file.name}"超过${this.config.maxFileSize / (1024 * 1024)}MB大小限制，无法上传。`;
    }
    return `文件"${file.name}"无法上传: 未知错误`;
  }
}

function generateUploadId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function setupAppinnUploader(api) {
  const siteSettings = api.container.lookup('site-settings:main');
  const config = buildConfig(siteSettings);
  const logger = createLogger(config.debug);
  const controller = new UploadController(api, config, logger);
  controller.init();
}
