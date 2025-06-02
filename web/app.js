/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @typedef {import("./interfaces.js").IL10n} IL10n */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/api.js").PDFDocumentProxy} PDFDocumentProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/api.js").PDFDocumentLoadingTask} PDFDocumentLoadingTask */

import {
  animationStarted,
  apiPageLayoutToViewerModes,
  apiPageModeToSidebarView,
  AutoPrintRegExp,
  CursorTool,
  DEFAULT_SCALE_VALUE,
  getActiveOrFocusedElement,
  isValidRotation,
  isValidScrollMode,
  isValidSpreadMode,
  normalizeWheelEventDirection,
  parseQueryString,
  ProgressBar,
  RenderingStates,
  ScrollMode,
  SidebarView,
  SpreadMode,
  TextLayerMode,
} from "./ui_utils.js";
import {
  AnnotationEditorType,
  build,
  FeatureTest,
  getDocument,
  getFilenameFromUrl,
  getPdfFilenameFromUrl,
  GlobalWorkerOptions,
  InvalidPDFException,
  isDataScheme,
  isPdfFile,
  PDFWorker,
  ResponseException,
  shadow,
  stopEvent,
  TouchManager,
  version,
} from "pdfjs-lib";
import { AppOptions, OptionKind } from "./app_options.js";
import { EventBus, FirefoxEventBus } from "./event_utils.js";
import { ExternalServices, initCom, MLManager } from "web-external_services";
import {
  ImageAltTextSettings,
  NewAltTextManager,
} from "web-new_alt_text_manager";
import { LinkTarget, PDFLinkService } from "./pdf_link_service.js";
import { AltTextManager } from "web-alt_text_manager";
import { AnnotationEditorParams } from "web-annotation_editor_params";
import { CaretBrowsingMode } from "./caret_browsing.js";
import { DownloadManager } from "web-download_manager";
import { EditorUndoBar } from "./editor_undo_bar.js";
import { OverlayManager } from "./overlay_manager.js";
import { PasswordPrompt } from "./password_prompt.js";
import { PDFAttachmentViewer } from "web-pdf_attachment_viewer";
import { PDFCursorTools } from "web-pdf_cursor_tools";
import { PDFDocumentProperties } from "web-pdf_document_properties";
import { PDFFindBar } from "web-pdf_find_bar";
import { PDFFindController } from "./pdf_find_controller.js";
import { PDFHistory } from "./pdf_history.js";
import { PDFLayerViewer } from "web-pdf_layer_viewer";
import { PDFOutlineViewer } from "web-pdf_outline_viewer";
import { PDFPresentationMode } from "web-pdf_presentation_mode";
import { PDFPrintServiceFactory } from "web-print_service";
import { PDFRenderingQueue } from "./pdf_rendering_queue.js";
import { PDFScriptingManager } from "./pdf_scripting_manager.js";
import { PDFSidebar } from "web-pdf_sidebar";
import { PDFThumbnailViewer } from "web-pdf_thumbnail_viewer";
import { PDFViewer } from "./pdf_viewer.js";
import { Preferences } from "web-preferences";
import { SecondaryToolbar } from "web-secondary_toolbar";
import { SignatureManager } from "web-signature_manager";
import { Toolbar } from "web-toolbar";
import { ViewHistory } from "./view_history.js";

const FORCE_PAGES_LOADED_TIMEOUT = 10000; // ms

const ViewOnLoad = {
  UNKNOWN: -1,
  PREVIOUS: 0, // Default value.
  INITIAL: 1,
};

const PDFViewerApplication = {
  initialBookmark: document.location.hash.substring(1),
  _initializedCapability: {
    ...Promise.withResolvers(),
    settled: false,
  },
  appConfig: null,
  /** @type {PDFDocumentProxy} */
  pdfDocument: null,
  /** @type {PDFDocumentLoadingTask} */
  pdfLoadingTask: null,
  printService: null,
  /** @type {PDFViewer} */
  pdfViewer: null,
  /** @type {PDFThumbnailViewer} */
  pdfThumbnailViewer: null,
  /** @type {PDFRenderingQueue} */
  pdfRenderingQueue: null,
  /** @type {PDFPresentationMode} */
  pdfPresentationMode: null,
  /** @type {PDFDocumentProperties} */
  pdfDocumentProperties: null,
  /** @type {PDFLinkService} */
  pdfLinkService: null,
  /** @type {PDFHistory} */
  pdfHistory: null,
  /** @type {PDFSidebar} */
  pdfSidebar: null,
  /** @type {PDFOutlineViewer} */
  pdfOutlineViewer: null,
  /** @type {PDFAttachmentViewer} */
  pdfAttachmentViewer: null,
  /** @type {PDFLayerViewer} */
  pdfLayerViewer: null,
  /** @type {PDFCursorTools} */
  pdfCursorTools: null,
  /** @type {PDFScriptingManager} */
  pdfScriptingManager: null,
  /** @type {ViewHistory} */
  store: null,
  /** @type {DownloadManager} */
  downloadManager: null,
  /** @type {OverlayManager} */
  overlayManager: null,
  /** @type {Preferences} */
  preferences: new Preferences(),
  /** @type {Toolbar} */
  toolbar: null,
  /** @type {SecondaryToolbar} */
  secondaryToolbar: null,
  /** @type {EventBus} */
  eventBus: null,
  /** @type {IL10n} */
  l10n: null,
  /** @type {AnnotationEditorParams} */
  annotationEditorParams: null,
  /** @type {ImageAltTextSettings} */
  imageAltTextSettings: null,
  isInitialViewSet: false,
  isViewerEmbedded: window.parent !== window,
  url: "",
  baseUrl: "",
  mlManager: null,
  _downloadUrl: "",
  _eventBusAbortController: null,
  _windowAbortController: null,
  _globalAbortController: new AbortController(),
  documentInfo: null,
  metadata: null,
  _contentDispositionFilename: null,
  _contentLength: null,
  _saveInProgress: false,
  _wheelUnusedTicks: 0,
  _wheelUnusedFactor: 1,
  _touchManager: null,
  _touchUnusedTicks: 0,
  _touchUnusedFactor: 1,
  _PDFBug: null,
  _hasAnnotationEditors: false,
  _title: document.title,
  _printAnnotationStoragePromise: null,
  _isCtrlKeyDown: false,
  _caretBrowsing: null,
  _isScrolling: false,
  editorUndoBar: null,

  // Called once when the document is loaded.
  async initialize(appConfig) {
    this.appConfig = appConfig;

    // Ensure that `Preferences`, and indirectly `AppOptions`, have initialized
    // before creating e.g. the various viewer components.
    try {
      await this.preferences.initializedPromise;
    } catch (ex) {
      console.error("initialize:", ex);
    }
    if (AppOptions.get("pdfBugEnabled")) {
      await this._parseHashParams();
    }

    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      let mode;
      switch (AppOptions.get("viewerCssTheme")) {
        case 1:
          mode = "is-light";
          break;
        case 2:
          mode = "is-dark";
          break;
      }
      if (mode) {
        document.documentElement.classList.add(mode);
      }
      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
        if (AppOptions.get("enableFakeMLManager")) {
          this.mlManager =
            MLManager.getFakeMLManager?.({
              enableGuessAltText: AppOptions.get("enableGuessAltText"),
              enableAltTextModelDownload: AppOptions.get(
                "enableAltTextModelDownload"
              ),
            }) || null;
        }
      }
    } else if (AppOptions.get("enableAltText")) {
      // We want to load the image-to-text AI engine as soon as possible.
      this.mlManager = new MLManager({
        enableGuessAltText: AppOptions.get("enableGuessAltText"),
        enableAltTextModelDownload: AppOptions.get(
          "enableAltTextModelDownload"
        ),
        altTextLearnMoreUrl: AppOptions.get("altTextLearnMoreUrl"),
      });
    }

    // Ensure that the `L10n`-instance has been initialized before creating
    // e.g. the various viewer components.
    this.l10n = await this.externalServices.createL10n();
    document.getElementsByTagName("html")[0].dir = this.l10n.getDirection();
    // Connect Fluent, when necessary, and translate what we already have.
    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      this.l10n.translate(appConfig.appContainer || document.documentElement);
    }

    if (
      this.isViewerEmbedded &&
      AppOptions.get("externalLinkTarget") === LinkTarget.NONE
    ) {
      // Prevent external links from "replacing" the viewer,
      // when it's embedded in e.g. an <iframe> or an <object>.
      AppOptions.set("externalLinkTarget", LinkTarget.TOP);
    }
    await this._initializeViewerComponents();

    // Bind the various event handlers *after* the viewer has been
    // initialized, to prevent errors if an event arrives too soon.
    this.bindEvents();
    this.bindWindowEvents();

    this._initializedCapability.settled = true;
    this._initializedCapability.resolve();
  },

  /**
   * Potentially parse special debugging flags in the hash section of the URL.
   * @private
   */
  async _parseHashParams() {
    const hash = document.location.hash.substring(1);
    if (!hash) {
      return;
    }
    const { mainContainer, viewerContainer } = this.appConfig,
      params = parseQueryString(hash);

    const loadPDFBug = async () => {
      if (this._PDFBug) {
        return;
      }
      const { PDFBug } =
        typeof PDFJSDev === "undefined"
          ? await import(AppOptions.get("debuggerSrc")) // eslint-disable-line no-unsanitized/method
          : await __non_webpack_import__(AppOptions.get("debuggerSrc"));

      this._PDFBug = PDFBug;
    };

    // Parameters that need to be handled manually.
    if (params.get("disableworker") === "true") {
      try {
        GlobalWorkerOptions.workerSrc ||= AppOptions.get("workerSrc");

        if (typeof PDFJSDev === "undefined") {
          globalThis.pdfjsWorker = await import("pdfjs/pdf.worker.js");
        } else {
          await __non_webpack_import__(PDFWorker.workerSrc);
        }
      } catch (ex) {
        console.error("_parseHashParams:", ex);
      }
    }
    if (params.has("textlayer")) {
      switch (params.get("textlayer")) {
        case "off":
          AppOptions.set("textLayerMode", TextLayerMode.DISABLE);
          break;
        case "visible":
        case "shadow":
        case "hover":
          viewerContainer.classList.add(`textLayer-${params.get("textlayer")}`);
          try {
            await loadPDFBug();
            this._PDFBug.loadCSS();
          } catch (ex) {
            console.error("_parseHashParams:", ex);
          }
          break;
      }
    }
    if (params.has("pdfbug")) {
      AppOptions.setAll({ pdfBug: true, fontExtraProperties: true });

      const enabled = params.get("pdfbug").split(",");
      try {
        await loadPDFBug();
        this._PDFBug.init(mainContainer, enabled);
      } catch (ex) {
        console.error("_parseHashParams:", ex);
      }
    }
    // It is not possible to change locale for the (various) extension builds.
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      params.has("locale")
    ) {
      AppOptions.set("localeProperties", { lang: params.get("locale") });
    }

    // Parameters that can be handled automatically.
    const opts = {
      disableAutoFetch: x => x === "true",
      disableFontFace: x => x === "true",
      disableHistory: x => x === "true",
      disableRange: x => x === "true",
      disableStream: x => x === "true",
      verbosity: x => x | 0,
    };

    // Set some specific preferences for tests.
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      Object.assign(opts, {
        enableAltText: x => x === "true",
        enableAutoLinking: x => x === "true",
        enableFakeMLManager: x => x === "true",
        enableGuessAltText: x => x === "true",
        enableUpdatedAddImage: x => x === "true",
        highlightEditorColors: x => x,
        maxCanvasPixels: x => parseInt(x),
        spreadModeOnLoad: x => parseInt(x),
        supportsCaretBrowsingMode: x => x === "true",
      });
    }

    for (const name in opts) {
      const check = opts[name],
        key = name.toLowerCase();

      if (params.has(key)) {
        AppOptions.set(name, check(params.get(key)));
      }
    }
  },

  /**
   * @private
   */
  async _initializeViewerComponents() {
    const { appConfig, externalServices, l10n } = this;

    const eventBus =
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")
        ? new FirefoxEventBus(
            AppOptions.get("allowedGlobalEvents"),
            externalServices,
            AppOptions.get("isInAutomation")
          )
        : new EventBus();
    this.eventBus = AppOptions.eventBus = eventBus;
    this.mlManager?.setEventBus(eventBus, this._globalAbortController.signal);

    this.overlayManager = new OverlayManager();

    const pdfRenderingQueue = new PDFRenderingQueue();
    pdfRenderingQueue.onIdle = this._cleanup.bind(this);
    this.pdfRenderingQueue = pdfRenderingQueue;

    const pdfLinkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: AppOptions.get("externalLinkTarget"),
      externalLinkRel: AppOptions.get("externalLinkRel"),
      ignoreDestinationZoom: AppOptions.get("ignoreDestinationZoom"),
    });
    this.pdfLinkService = pdfLinkService;

    const downloadManager = (this.downloadManager = new DownloadManager());

    const findController = new PDFFindController({
      linkService: pdfLinkService,
      eventBus,
      updateMatchesCountOnProgress:
        typeof PDFJSDev === "undefined"
          ? !window.isGECKOVIEW
          : !PDFJSDev.test("GECKOVIEW"),
    });
    this.findController = findController;

    const pdfScriptingManager = new PDFScriptingManager({
      eventBus,
      externalServices,
      docProperties: this._scriptingDocProperties.bind(this),
    });
    this.pdfScriptingManager = pdfScriptingManager;

    const container = appConfig.mainContainer,
      viewer = appConfig.viewerContainer;
    const annotationEditorMode = AppOptions.get("annotationEditorMode");
    const pageColors =
      AppOptions.get("forcePageColors") ||
      window.matchMedia("(forced-colors: active)").matches
        ? {
            background: AppOptions.get("pageColorsBackground"),
            foreground: AppOptions.get("pageColorsForeground"),
          }
        : null;
    let altTextManager;
    if (AppOptions.get("enableUpdatedAddImage")) {
      altTextManager = appConfig.newAltTextDialog
        ? new NewAltTextManager(
            appConfig.newAltTextDialog,
            this.overlayManager,
            eventBus
          )
        : null;
    } else {
      altTextManager = appConfig.altTextDialog
        ? new AltTextManager(
            appConfig.altTextDialog,
            container,
            this.overlayManager,
            eventBus
          )
        : null;
    }

    if (appConfig.editorUndoBar) {
      this.editorUndoBar = new EditorUndoBar(appConfig.editorUndoBar, eventBus);
    }

    const signatureManager = appConfig.addSignatureDialog
      ? new SignatureManager(
          appConfig.addSignatureDialog,
          this.overlayManager,
          this.l10n
        )
      : null;

    const enableHWA = AppOptions.get("enableHWA");
    const pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      renderingQueue: pdfRenderingQueue,
      linkService: pdfLinkService,
      downloadManager,
      altTextManager,
      signatureManager,
      editorUndoBar: this.editorUndoBar,
      findController,
      scriptingManager:
        AppOptions.get("enableScripting") && pdfScriptingManager,
      l10n,
      textLayerMode: AppOptions.get("textLayerMode"),
      annotationMode: AppOptions.get("annotationMode"),
      annotationEditorMode,
      annotationEditorHighlightColors: AppOptions.get("highlightEditorColors"),
      enableHighlightFloatingButton: AppOptions.get(
        "enableHighlightFloatingButton"
      ),
      enableUpdatedAddImage: AppOptions.get("enableUpdatedAddImage"),
      enableNewAltTextWhenAddingImage: AppOptions.get(
        "enableNewAltTextWhenAddingImage"
      ),
      imageResourcesPath: AppOptions.get("imageResourcesPath"),
      enablePrintAutoRotate: AppOptions.get("enablePrintAutoRotate"),
      maxCanvasPixels: AppOptions.get("maxCanvasPixels"),
      enablePermissions: AppOptions.get("enablePermissions"),
      pageColors,
      mlManager: this.mlManager,
      abortSignal: this._globalAbortController.signal,
      enableHWA,
      supportsPinchToZoom: this.supportsPinchToZoom,
      enableAutoLinking: AppOptions.get("enableAutoLinking"),
    });
    this.pdfViewer = pdfViewer;

    pdfRenderingQueue.setViewer(pdfViewer);
    pdfLinkService.setViewer(pdfViewer);
    pdfScriptingManager.setViewer(pdfViewer);

    if (appConfig.sidebar?.thumbnailView) {
      this.pdfThumbnailViewer = new PDFThumbnailViewer({
        container: appConfig.sidebar.thumbnailView,
        eventBus,
        renderingQueue: pdfRenderingQueue,
        linkService: pdfLinkService,
        pageColors,
        abortSignal: this._globalAbortController.signal,
        enableHWA,
      });
      pdfRenderingQueue.setThumbnailViewer(this.pdfThumbnailViewer);
    }

    // The browsing history is only enabled when the viewer is standalone,
    // i.e. not when it is embedded in a web page.
    if (!this.isViewerEmbedded && !AppOptions.get("disableHistory")) {
      this.pdfHistory = new PDFHistory({
        linkService: pdfLinkService,
        eventBus,
      });
      pdfLinkService.setHistory(this.pdfHistory);
    }

    if (!this.supportsIntegratedFind && appConfig.findBar) {
      this.findBar = new PDFFindBar(
        appConfig.findBar,
        appConfig.principalContainer,
        eventBus
      );
    }

    if (appConfig.annotationEditorParams) {
      if (
        ((typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
          typeof AbortSignal.any === "function") &&
        annotationEditorMode !== AnnotationEditorType.DISABLE
      ) {
        const editorSignatureButton = appConfig.toolbar?.editorSignatureButton;
        if (editorSignatureButton && AppOptions.get("enableSignatureEditor")) {
          editorSignatureButton.parentElement.hidden = false;
        }
        this.annotationEditorParams = new AnnotationEditorParams(
          appConfig.annotationEditorParams,
          eventBus
        );
      } else {
        for (const id of ["editorModeButtons", "editorModeSeparator"]) {
          document.getElementById(id)?.classList.add("hidden");
        }
      }
    }

    if (
      this.mlManager &&
      appConfig.secondaryToolbar?.imageAltTextSettingsButton
    ) {
      this.imageAltTextSettings = new ImageAltTextSettings(
        appConfig.altTextSettingsDialog,
        this.overlayManager,
        eventBus,
        this.mlManager
      );
    }

    if (appConfig.documentProperties) {
      this.pdfDocumentProperties = new PDFDocumentProperties(
        appConfig.documentProperties,
        this.overlayManager,
        eventBus,
        l10n,
        /* fileNameLookup = */ () => this._docFilename
      );
    }

    // NOTE: The cursor-tools are unlikely to be helpful/useful in GeckoView,
    // in particular the `HandTool` which basically simulates touch scrolling.
    if (appConfig.secondaryToolbar?.cursorHandToolButton) {
      this.pdfCursorTools = new PDFCursorTools({
        container,
        eventBus,
        cursorToolOnLoad: AppOptions.get("cursorToolOnLoad"),
      });
    }

    if (appConfig.toolbar) {
      if (
        typeof PDFJSDev === "undefined"
          ? window.isGECKOVIEW
          : PDFJSDev.test("GECKOVIEW")
      ) {
        const nimbusData = JSON.parse(
          AppOptions.get("nimbusDataStr") || "null"
        );
        this.toolbar = new Toolbar(appConfig.toolbar, eventBus, nimbusData);
      } else {
        this.toolbar = new Toolbar(
          appConfig.toolbar,
          eventBus,
          AppOptions.get("toolbarDensity")
        );
      }
    }

    if (appConfig.secondaryToolbar) {
      if (AppOptions.get("enableAltText")) {
        appConfig.secondaryToolbar.imageAltTextSettingsButton?.classList.remove(
          "hidden"
        );
        appConfig.secondaryToolbar.imageAltTextSettingsSeparator?.classList.remove(
          "hidden"
        );
      }

      this.secondaryToolbar = new SecondaryToolbar(
        appConfig.secondaryToolbar,
        eventBus
      );
    }

    if (
      this.supportsFullscreen &&
      appConfig.secondaryToolbar?.presentationModeButton
    ) {
      this.pdfPresentationMode = new PDFPresentationMode({
        container,
        pdfViewer,
        eventBus,
      });
    }

    if (appConfig.passwordOverlay) {
      this.passwordPrompt = new PasswordPrompt(
        appConfig.passwordOverlay,
        this.overlayManager,
        this.isViewerEmbedded
      );
    }

    if (appConfig.sidebar?.outlineView) {
      this.pdfOutlineViewer = new PDFOutlineViewer({
        container: appConfig.sidebar.outlineView,
        eventBus,
        l10n,
        linkService: pdfLinkService,
        downloadManager,
      });
    }

    if (appConfig.sidebar?.attachmentsView) {
      this.pdfAttachmentViewer = new PDFAttachmentViewer({
        container: appConfig.sidebar.attachmentsView,
        eventBus,
        l10n,
        downloadManager,
      });
    }

    if (appConfig.sidebar?.layersView) {
      this.pdfLayerViewer = new PDFLayerViewer({
        container: appConfig.sidebar.layersView,
        eventBus,
        l10n,
      });
    }

    if (appConfig.sidebar) {
      this.pdfSidebar = new PDFSidebar({
        elements: appConfig.sidebar,
        eventBus,
        l10n,
      });
      this.pdfSidebar.onToggled = this.forceRendering.bind(this);
      this.pdfSidebar.onUpdateThumbnails = () => {
        // Use the rendered pages to set the corresponding thumbnail images.
        for (const pageView of pdfViewer.getCachedPageViews()) {
          if (pageView.renderingState === RenderingStates.FINISHED) {
            this.pdfThumbnailViewer
              .getThumbnail(pageView.id - 1)
              ?.setImage(pageView);
          }
        }
        this.pdfThumbnailViewer.scrollThumbnailIntoView(
          pdfViewer.currentPageNumber
        );
      };
    }
  },

  async run(config) {
    await this.initialize(config);

    const { appConfig, eventBus } = this;
    let file;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      const queryString = document.location.search.substring(1);
      const params = parseQueryString(queryString);
      file = params.get("file") ?? AppOptions.get("defaultUrl");
      validateFileURL(file);
    } else if (PDFJSDev.test("MOZCENTRAL")) {
      file = window.location.href;
    } else if (PDFJSDev.test("CHROME")) {
      file = AppOptions.get("defaultUrl");
    }

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      const fileInput = (this._openFileInput = document.createElement("input"));
      fileInput.id = "fileInput";
      fileInput.hidden = true;
      fileInput.type = "file";
      fileInput.value = null;
      document.body.append(fileInput);

      fileInput.addEventListener("change", function (evt) {
        const { files } = evt.target;
        if (!files || files.length === 0) {
          return;
        }
        eventBus.dispatch("fileinputchange", {
          source: this,
          fileInput: evt.target,
        });
      });

      // Enable dragging-and-dropping a new PDF file onto the viewerContainer.
      appConfig.mainContainer.addEventListener("dragover", function (evt) {
        for (const item of evt.dataTransfer.items) {
          if (item.type === "application/pdf") {
            evt.dataTransfer.dropEffect =
              evt.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
            stopEvent(evt);
            return;
          }
        }
      });
      appConfig.mainContainer.addEventListener("drop", function (evt) {
        if (evt.dataTransfer.files?.[0].type !== "application/pdf") {
          return;
        }
        stopEvent(evt);
        eventBus.dispatch("fileinputchange", {
          source: this,
          fileInput: evt.dataTransfer,
        });
      });
    }

    if (!AppOptions.get("supportsDocumentFonts")) {
      AppOptions.set("disableFontFace", true);
      this.l10n.get("pdfjs-web-fonts-disabled").then(msg => {
        console.warn(msg);
      });
    }

    if (!this.supportsPrinting) {
      appConfig.toolbar?.print?.classList.add("hidden");
      appConfig.secondaryToolbar?.printButton.classList.add("hidden");
    }

    if (!this.supportsFullscreen) {
      appConfig.secondaryToolbar?.presentationModeButton.classList.add(
        "hidden"
      );
    }

    if (this.supportsIntegratedFind) {
      appConfig.findBar?.toggleButton?.classList.add("hidden");
    }

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      if (file) {
        this.open({ url: file });
      } else {
        this._hideViewBookmark();
      }
    } else if (PDFJSDev.test("MOZCENTRAL || CHROME")) {
      this.setTitleUsingUrl(file, /* downloadUrl = */ file);

      this.externalServices.initPassiveLoading();
    } else {
      throw new Error("Not implemented: run");
    }
  },

  get externalServices() {
    return shadow(this, "externalServices", new ExternalServices());
  },

  get initialized() {
    return this._initializedCapability.settled;
  },

  get initializedPromise() {
    return this._initializedCapability.promise;
  },

  updateZoom(steps, scaleFactor, origin) {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }
    this.pdfViewer.updateScale({
      drawingDelay: AppOptions.get("defaultZoomDelay"),
      steps,
      scaleFactor,
      origin,
    });
  },

  zoomIn() {
    this.updateZoom(1);
  },

  zoomOut() {
    this.updateZoom(-1);
  },

  zoomReset() {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }
    this.pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
  },

  touchPinchCallback(origin, prevDistance, distance) {
    if (this.supportsPinchToZoom) {
      const newScaleFactor = this._accumulateFactor(
        this.pdfViewer.currentScale,
        distance / prevDistance,
        "_touchUnusedFactor"
      );
      this.updateZoom(null, newScaleFactor, origin);
    } else {
      const PIXELS_PER_LINE_SCALE = 30;
      const ticks = this._accumulateTicks(
        (distance - prevDistance) / PIXELS_PER_LINE_SCALE,
        "_touchUnusedTicks"
      );
      this.updateZoom(ticks, null, origin);
    }
  },

  touchPinchEndCallback() {
    this._touchUnusedTicks = 0;
    this._touchUnusedFactor = 1;
  },

  get pagesCount() {
    return this.pdfDocument ? this.pdfDocument.numPages : 0;
  },

  get page() {
    return this.pdfViewer.currentPageNumber;
  },

  set page(val) {
    this.pdfViewer.currentPageNumber = val;
  },

  get supportsPrinting() {
    return PDFPrintServiceFactory.supportsPrinting;
  },

  get supportsFullscreen() {
    return shadow(this, "supportsFullscreen", document.fullscreenEnabled);
  },

  get supportsPinchToZoom() {
    return shadow(
      this,
      "supportsPinchToZoom",
      AppOptions.get("supportsPinchToZoom")
    );
  },

  get supportsIntegratedFind() {
    return shadow(
      this,
      "supportsIntegratedFind",
      AppOptions.get("supportsIntegratedFind")
    );
  },

  get loadingBar() {
    const barElement = document.getElementById("loadingBar");
    const bar = barElement ? new ProgressBar(barElement) : null;
    return shadow(this, "loadingBar", bar);
  },

  get supportsMouseWheelZoomCtrlKey() {
    return shadow(
      this,
      "supportsMouseWheelZoomCtrlKey",
      AppOptions.get("supportsMouseWheelZoomCtrlKey")
    );
  },

  get supportsMouseWheelZoomMetaKey() {
    return shadow(
      this,
      "supportsMouseWheelZoomMetaKey",
      AppOptions.get("supportsMouseWheelZoomMetaKey")
    );
  },

  get supportsCaretBrowsingMode() {
    return AppOptions.get("supportsCaretBrowsingMode");
  },

  moveCaret(isUp, select) {
    this._caretBrowsing ||= new CaretBrowsingMode(
      this._globalAbortController.signal,
      this.appConfig.mainContainer,
      this.appConfig.viewerContainer,
      this.appConfig.toolbar?.container
    );
    this._caretBrowsing.moveCaret(isUp, select);
  },

  setTitleUsingUrl(url = "", downloadUrl = null) {
    this.url = url;
    this.baseUrl = url.split("#", 1)[0];
    if (downloadUrl) {
      this._downloadUrl =
        downloadUrl === url ? this.baseUrl : downloadUrl.split("#", 1)[0];
    }
    if (isDataScheme(url)) {
      this._hideViewBookmark();
    } else if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("MOZCENTRAL || CHROME")
    ) {
      AppOptions.set("docBaseUrl", this.baseUrl);
    }

    let title = getPdfFilenameFromUrl(url, "");
    if (!title) {
      try {
        title = decodeURIComponent(getFilenameFromUrl(url));
      } catch {
        // decodeURIComponent may throw URIError.
      }
    }
    this.setTitle(title || url); // Always fallback to the raw URL.
  },

  setTitle(title = this._title) {
    this._title = title;

    if (this.isViewerEmbedded) {
      // Embedded PDF viewers should not be changing their parent page's title.
      return;
    }
    const editorIndicator =
      this._hasAnnotationEditors && !this.pdfRenderingQueue.printing;
    document.title = `${editorIndicator ? "* " : ""}${title}`;
  },

  get _docFilename() {
    // Use `this.url` instead of `this.baseUrl` to perform filename detection
    // based on the reference fragment as ultimate fallback if needed.
    return this._contentDispositionFilename || getPdfFilenameFromUrl(this.url);
  },

  /**
   * @private
   */
  _hideViewBookmark() {
    const { secondaryToolbar } = this.appConfig;
    // URL does not reflect proper document location - hiding some buttons.
    secondaryToolbar?.viewBookmarkButton.classList.add("hidden");

    // Avoid displaying multiple consecutive separators in the secondaryToolbar.
    if (secondaryToolbar?.presentationModeButton.classList.contains("hidden")) {
      document.getElementById("viewBookmarkSeparator")?.classList.add("hidden");
    }
  },

  /**
   * Closes opened PDF document.
   * @returns {Promise} - Returns the promise, which is resolved when all
   *                      destruction is completed.
   */
  async close() {
    this._unblockDocumentLoadEvent();
    this._hideViewBookmark();

    if (!this.pdfLoadingTask) {
      return;
    }
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("GENERIC && !TESTING")) &&
      this.pdfDocument?.annotationStorage.size > 0 &&
      this._annotationStorageModified
    ) {
      try {
        // Trigger saving, to prevent data loss in forms; see issue 12257.
        await this.save();
      } catch {
        // Ignoring errors, to ensure that document closing won't break.
      }
    }
    const promises = [];

    promises.push(this.pdfLoadingTask.destroy());
    this.pdfLoadingTask = null;

    if (this.pdfDocument) {
      this.pdfDocument = null;

      this.pdfThumbnailViewer?.setDocument(null);
      this.pdfViewer.setDocument(null);
      this.pdfLinkService.setDocument(null);
      this.pdfDocumentProperties?.setDocument(null);
    }
    this.pdfLinkService.externalLinkEnabled = true;
    this.store = null;
    this.isInitialViewSet = false;
    this.url = "";
    this.baseUrl = "";
    this._downloadUrl = "";
    this.documentInfo = null;
    this.metadata = null;
    this._contentDispositionFilename = null;
    this._contentLength = null;
    this._saveInProgress = false;
    this._hasAnnotationEditors = false;

    promises.push(
      this.pdfScriptingManager.destroyPromise,
      this.passwordPrompt.close()
    );

    this.setTitle();
    this.pdfSidebar?.reset();
    this.pdfOutlineViewer?.reset();
    this.pdfAttachmentViewer?.reset();
    this.pdfLayerViewer?.reset();

    this.pdfHistory?.reset();
    this.findBar?.reset();
    this.toolbar?.reset();
    this.secondaryToolbar?.reset();
    this._PDFBug?.cleanup();

    await Promise.all(promises);
  },

  /**
   * Opens a new PDF document.
   * @param {Object} args - Accepts any/all of the properties from
   *   {@link DocumentInitParameters}, and also a `originalUrl` string.
   * @returns {Promise} - Promise that is resolved when the document is opened.
   */
  async open(args) {
    if (this.pdfLoadingTask) {
      // We need to destroy already opened document.
      await this.close();
    }
    // Set the necessary global worker parameters, using the available options.
    const workerParams = AppOptions.getAll(OptionKind.WORKER);
    Object.assign(GlobalWorkerOptions, workerParams);

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      if (args.data && isPdfFile(args.filename)) {
        this._contentDispositionFilename = args.filename;
      }
    } else if (args.url) {
      // The Firefox built-in viewer always calls `setTitleUsingUrl`, before
      // `initPassiveLoading`, and it never provides an `originalUrl` here.
      this.setTitleUsingUrl(
        args.originalUrl || args.url,
        /* downloadUrl = */ args.url
      );
    }

    // Set the necessary API parameters, using all the available options.
    const apiParams = AppOptions.getAll(OptionKind.API);
    const loadingTask = getDocument({
      ...apiParams,
      ...args,
    });
    this.pdfLoadingTask = loadingTask;

    loadingTask.onPassword = (updateCallback, reason) => {
      if (this.isViewerEmbedded) {
        // The load event can't be triggered until the password is entered, so
        // if the viewer is in an iframe and its visibility depends on the
        // onload callback then the viewer never shows (bug 1801341).
        this._unblockDocumentLoadEvent();
      }

      this.pdfLinkService.externalLinkEnabled = false;
      this.passwordPrompt.setUpdateCallback(updateCallback, reason);
      this.passwordPrompt.open();
    };

    loadingTask.onProgress = ({ loaded, total }) => {
      this.progress(loaded / total);
    };

    return loadingTask.promise.then(
      pdfDocument => {
        this.load(pdfDocument);
      },
      reason => {
        if (loadingTask !== this.pdfLoadingTask) {
          return undefined; // Ignore errors for previously opened PDF files.
        }

        let key = "pdfjs-loading-error";
        if (reason instanceof InvalidPDFException) {
          key = "pdfjs-invalid-file-error";
        } else if (reason instanceof ResponseException) {
          key = reason.missing
            ? "pdfjs-missing-file-error"
            : "pdfjs-unexpected-response-error";
        }
        return this._documentError(key, { message: reason.message }).then(
          () => {
            throw reason;
          }
        );
      }
    );
  },

  async download() {
    let data;
    try {
      data = await this.pdfDocument.getData();
    } catch {
      // When the PDF document isn't ready, simply download using the URL.
    }
    this.downloadManager.download(data, this._downloadUrl, this._docFilename);
  },

  async save() {
    if (this._saveInProgress) {
      return;
    }
    this._saveInProgress = true;
    await this.pdfScriptingManager.dispatchWillSave();

    try {
      const data = await this.pdfDocument.saveDocument();
      this.downloadManager.download(data, this._downloadUrl, this._docFilename);
    } catch (reason) {
      // When the PDF document isn't ready, fallback to a "regular" download.
      console.error(`Error when saving the document:`, reason);
      await this.download();
    } finally {
      await this.pdfScriptingManager.dispatchDidSave();
      this._saveInProgress = false;
    }

    if (this._hasAnnotationEditors) {
      this.externalServices.reportTelemetry({
        type: "editing",
        data: {
          type: "save",
          stats: this.pdfDocument?.annotationStorage.editorStats,
        },
      });
    }
  },

  async downloadOrSave() {
    // In the Firefox case, this method MUST always trigger a download.
    // When the user is closing a modified and unsaved document, we display a
    // prompt asking for saving or not. In case they save, we must wait for
    // saving to complete before closing the tab.
    // So in case this function does not trigger a download, we must trigger a
    // a message and change PdfjsChild.sys.mjs to take it into account.
    const { classList } = this.appConfig.appContainer;
    classList.add("wait");
    await (this.pdfDocument?.annotationStorage.size > 0
      ? this.save()
      : this.download());
    classList.remove("wait");
  },

  /**
   * Report the error; used for errors affecting loading and/or parsing of
   * the entire PDF document.
   */
  async _documentError(key, moreInfo = null) {
    this._unblockDocumentLoadEvent();

    const message = await this._otherError(
      key || "pdfjs-loading-error",
      moreInfo
    );

    this.eventBus.dispatch("documenterror", {
      source: this,
      message,
      reason: moreInfo?.message ?? null,
    });
  },

  /**
   * Report the error; used for errors affecting e.g. only a single page.
   * @param {string} key - The localization key for the error.
   * @param {Object} [moreInfo] - Further information about the error that is
   *                              more technical. Should have a 'message' and
   *                              optionally a 'stack' property.
   * @returns {string} A (localized) error message that is human readable.
   */
  async _otherError(key, moreInfo = null) {
    const message = await this.l10n.get(key);

    const moreInfoText = [`PDF.js v${version || "?"} (build: ${build || "?"})`];
    if (moreInfo) {
      moreInfoText.push(`Message: ${moreInfo.message}`);

      if (moreInfo.stack) {
        moreInfoText.push(`Stack: ${moreInfo.stack}`);
      } else {
        if (moreInfo.filename) {
          moreInfoText.push(`File: ${moreInfo.filename}`);
        }
        if (moreInfo.lineNumber) {
          moreInfoText.push(`Line: ${moreInfo.lineNumber}`);
        }
      }
    }

    console.error(`${message}\n\n${moreInfoText.join("\n")}`);
    return message;
  },

  progress(level) {
    const percent = Math.round(level * 100);
    // When we transition from full request to range requests, it's possible
    // that we discard some of the loaded data. This can cause the loading
    // bar to move backwards. So prevent this by only updating the bar if it
    // increases.
    if (!this.loadingBar || percent <= this.loadingBar.percent) {
      return;
    }
    this.loadingBar.percent = percent;

    // When disableAutoFetch is enabled, it's not uncommon for the entire file
    // to never be fetched (depends on e.g. the file structure). In this case
    // the loading bar will not be completely filled, nor will it be hidden.
    // To prevent displaying a partially filled loading bar permanently, we
    // hide it when no data has been loaded during a certain amount of time.
    if (
      this.pdfDocument?.loadingParams.disableAutoFetch ??
      AppOptions.get("disableAutoFetch")
    ) {
      this.loadingBar.setDisableAutoFetch();
    }
  },

  load(pdfDocument) {
    this.pdfDocument = pdfDocument;

    pdfDocument.getDownloadInfo().then(({ length }) => {
      this._contentLength = length; // Ensure that the correct length is used.
      this.loadingBar?.hide();

      firstPagePromise.then(() => {
        this.eventBus.dispatch("documentloaded", { source: this });
      });
    });

    // Since the `setInitialView` call below depends on this being resolved,
    // fetch it early to avoid delaying initial rendering of the PDF document.
    const pageLayoutPromise = pdfDocument.getPageLayout().catch(() => {
      /* Avoid breaking initial rendering; ignoring errors. */
    });
    const pageModePromise = pdfDocument.getPageMode().catch(() => {
      /* Avoid breaking initial rendering; ignoring errors. */
    });
    const openActionPromise = pdfDocument.getOpenAction().catch(() => {
      /* Avoid breaking initial rendering; ignoring errors. */
    });

    this.toolbar?.setPagesCount(pdfDocument.numPages, false);
    this.secondaryToolbar?.setPagesCount(pdfDocument.numPages);

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME")) {
      const baseUrl = location.href.split("#", 1)[0];
      // Ignore "data:"-URLs for performance reasons, even though it may cause
      // internal links to not work perfectly in all cases (see bug 1803050).
      this.pdfLinkService.setDocument(
        pdfDocument,
        isDataScheme(baseUrl) ? null : baseUrl
      );
    } else {
      this.pdfLinkService.setDocument(pdfDocument);
    }
    this.pdfDocumentProperties?.setDocument(pdfDocument);

    const pdfViewer = this.pdfViewer;
    pdfViewer.setDocument(pdfDocument);
    const { firstPagePromise, onePageRendered, pagesPromise } = pdfViewer;

    this.pdfThumbnailViewer?.setDocument(pdfDocument);

    const storedPromise = (this.store = new ViewHistory(
      pdfDocument.fingerprints[0]
    ))
      .getMultiple({
        page: null,
        zoom: DEFAULT_SCALE_VALUE,
        scrollLeft: "0",
        scrollTop: "0",
        rotation: null,
        sidebarView: SidebarView.UNKNOWN,
        scrollMode: ScrollMode.UNKNOWN,
        spreadMode: SpreadMode.UNKNOWN,
      })
      .catch(() => {
        /* Unable to read from storage; ignoring errors. */
      });

    firstPagePromise.then(pdfPage => {
      this.loadingBar?.setWidth(this.appConfig.viewerContainer);
      this._initializeAnnotationStorageCallbacks(pdfDocument);

      Promise.all([
        animationStarted,
        storedPromise,
        pageLayoutPromise,
        pageModePromise,
        openActionPromise,
      ])
        .then(async ([timeStamp, stored, pageLayout, pageMode, openAction]) => {
          const viewOnLoad = AppOptions.get("viewOnLoad");

          this._initializePdfHistory({
            fingerprint: pdfDocument.fingerprints[0],
            viewOnLoad,
            initialDest: openAction?.dest,
          });
          const initialBookmark = this.initialBookmark;

          // Initialize the default values, from user preferences.
          const zoom = AppOptions.get("defaultZoomValue");
          let hash = zoom ? `zoom=${zoom}` : null;

          let rotation = null;
          let sidebarView = AppOptions.get("sidebarViewOnLoad");
          let scrollMode = AppOptions.get("scrollModeOnLoad");
          let spreadMode = AppOptions.get("spreadModeOnLoad");

          if (stored?.page && viewOnLoad !== ViewOnLoad.INITIAL) {
            hash =
              `page=${stored.page}&zoom=${zoom || stored.zoom},` +
              `${stored.scrollLeft},${stored.scrollTop}`;

            rotation = parseInt(stored.rotation, 10);
            // Always let user preference take precedence over the view history.
            if (sidebarView === SidebarView.UNKNOWN) {
              sidebarView = stored.sidebarView | 0;
            }
            if (scrollMode === ScrollMode.UNKNOWN) {
              scrollMode = stored.scrollMode | 0;
            }
            if (spreadMode === SpreadMode.UNKNOWN) {
              spreadMode = stored.spreadMode | 0;
            }
          }
          // Always let the user preference/view history take precedence.
          if (pageMode && sidebarView === SidebarView.UNKNOWN) {
            sidebarView = apiPageModeToSidebarView(pageMode);
          }
          if (
            pageLayout &&
            scrollMode === ScrollMode.UNKNOWN &&
            spreadMode === SpreadMode.UNKNOWN
          ) {
            const modes = apiPageLayoutToViewerModes(pageLayout);
            // TODO: Try to improve page-switching when using the mouse-wheel
            // and/or arrow-keys before allowing the document to control this.
            // scrollMode = modes.scrollMode;
            spreadMode = modes.spreadMode;
          }

          this.setInitialView(hash, {
            rotation,
            sidebarView,
            scrollMode,
            spreadMode,
          });
          this.eventBus.dispatch("documentinit", { source: this });
          // Make all navigation keys work on document load,
          // unless the viewer is embedded in a web page.
          if (!this.isViewerEmbedded) {
            pdfViewer.focus();
          }

          // For documents with different page sizes, once all pages are
          // resolved, ensure that the correct location becomes visible on load.
          // (To reduce the risk, in very large and/or slow loading documents,
          //  that the location changes *after* the user has started interacting
          //  with the viewer, wait for either `pagesPromise` or a timeout.)
          await Promise.race([
            pagesPromise,
            new Promise(resolve => {
              setTimeout(resolve, FORCE_PAGES_LOADED_TIMEOUT);
            }),
          ]);
          if (!initialBookmark && !hash) {
            return;
          }
          if (pdfViewer.hasEqualPageSizes) {
            return;
          }
          this.initialBookmark = initialBookmark;

          // eslint-disable-next-line no-self-assign
          pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;
          // Re-apply the initial document location.
          this.setInitialView(hash);
        })
        .catch(() => {
          // Ensure that the document is always completely initialized,
          // even if there are any errors thrown above.
          this.setInitialView();
        })
        .then(function () {
          // At this point, rendering of the initial page(s) should always have
          // started (and may even have completed).
          // To prevent any future issues, e.g. the document being completely
          // blank on load, always trigger rendering here.
          pdfViewer.update();
        });
    });

    pagesPromise.then(
      () => {
        this._unblockDocumentLoadEvent();

        this._initializeAutoPrint(pdfDocument, openActionPromise);
      },
      reason => {
        this._documentError("pdfjs-loading-error", { message: reason.message });
      }
    );

    onePageRendered.then(data => {
      this.externalServices.reportTelemetry({
        type: "pageInfo",
        timestamp: data.timestamp,
      });

      if (this.pdfOutlineViewer) {
        pdfDocument.getOutline().then(outline => {
          if (pdfDocument !== this.pdfDocument) {
            return; // The document was closed while the outline resolved.
          }
          this.pdfOutlineViewer.render({ outline, pdfDocument });
        });
      }
      if (this.pdfAttachmentViewer) {
        pdfDocument.getAttachments().then(attachments => {
          if (pdfDocument !== this.pdfDocument) {
            return; // The document was closed while the attachments resolved.
          }
          this.pdfAttachmentViewer.render({ attachments });
        });
      }
      if (this.pdfLayerViewer) {
        // Ensure that the layers accurately reflects the current state in the
        // viewer itself, rather than the default state provided by the API.
        pdfViewer.optionalContentConfigPromise.then(optionalContentConfig => {
          if (pdfDocument !== this.pdfDocument) {
            return; // The document was closed while the layers resolved.
          }
          this.pdfLayerViewer.render({ optionalContentConfig, pdfDocument });
        });
      }
    });

    this._initializePageLabels(pdfDocument);
    this._initializeMetadata(pdfDocument);
  },

  /**
   * @private
   */
  async _scriptingDocProperties(pdfDocument) {
    if (!this.documentInfo) {
      // It should be *extremely* rare for metadata to not have been resolved
      // when this code runs, but ensure that we handle that case here.
      await new Promise(resolve => {
        this.eventBus._on("metadataloaded", resolve, { once: true });
      });
      if (pdfDocument !== this.pdfDocument) {
        return null; // The document was closed while the metadata resolved.
      }
    }
    if (!this._contentLength) {
      // Always waiting for the entire PDF document to be loaded will, most
      // likely, delay sandbox-creation too much in the general case for all
      // PDF documents which are not provided as binary data to the API.
      // Hence we'll simply have to trust that the `contentLength` (as provided
      // by the server), when it exists, is accurate enough here.
      await new Promise(resolve => {
        this.eventBus._on("documentloaded", resolve, { once: true });
      });
      if (pdfDocument !== this.pdfDocument) {
        return null; // The document was closed while the downloadInfo resolved.
      }
    }

    return {
      ...this.documentInfo,
      baseURL: this.baseUrl,
      filesize: this._contentLength,
      filename: this._docFilename,
      metadata: this.metadata?.getRaw(),
      authors: this.metadata?.get("dc:creator"),
      numPages: this.pagesCount,
      URL: this.url,
    };
  },

  /**
   * @private
   */
  async _initializeAutoPrint(pdfDocument, openActionPromise) {
    const [openAction, jsActions] = await Promise.all([
      openActionPromise,
      this.pdfViewer.enableScripting ? null : pdfDocument.getJSActions(),
    ]);

    if (pdfDocument !== this.pdfDocument) {
      return; // The document was closed while the auto print data resolved.
    }
    let triggerAutoPrint = openAction?.action === "Print";

    if (jsActions) {
      console.warn("Warning: JavaScript support is not enabled");

      // Hack to support auto printing.
      for (const name in jsActions) {
        if (triggerAutoPrint) {
          break;
        }
        switch (name) {
          case "WillClose":
          case "WillSave":
          case "DidSave":
          case "WillPrint":
          case "DidPrint":
            continue;
        }
        triggerAutoPrint = jsActions[name].some(js => AutoPrintRegExp.test(js));
      }
    }

    if (triggerAutoPrint) {
      this.triggerPrinting();
    }
  },

  /**
   * @private
   */
  async _initializeMetadata(pdfDocument) {
    const { info, metadata, contentDispositionFilename, contentLength } =
      await pdfDocument.getMetadata();

    if (pdfDocument !== this.pdfDocument) {
      return; // The document was closed while the metadata resolved.
    }
    this.documentInfo = info;
    this.metadata = metadata;
    this._contentDispositionFilename ??= contentDispositionFilename;
    this._contentLength ??= contentLength; // See `getDownloadInfo`-call above.

    // Provides some basic debug information
    console.log(
      `PDF ${pdfDocument.fingerprints[0]} [${info.PDFFormatVersion} ` +
        `${(info.Producer || "-").trim()} / ${(info.Creator || "-").trim()}] ` +
        `(PDF.js: ${version || "?"} [${build || "?"}])`
    );
    let pdfTitle = info.Title;

    const metadataTitle = metadata?.get("dc:title");
    if (metadataTitle) {
      // Ghostscript can produce invalid 'dc:title' Metadata entries:
      //  - The title may be "Untitled" (fixes bug 1031612).
      //  - The title may contain incorrectly encoded characters, which thus
      //    looks broken, hence we ignore the Metadata entry when it contains
      //    characters from the Specials Unicode block (fixes bug 1605526).
      if (
        metadataTitle !== "Untitled" &&
        !/[\uFFF0-\uFFFF]/g.test(metadataTitle)
      ) {
        pdfTitle = metadataTitle;
      }
    }
    if (pdfTitle) {
      this.setTitle(
        `${pdfTitle} - ${this._contentDispositionFilename || this._title}`
      );
    } else if (this._contentDispositionFilename) {
      this.setTitle(this._contentDispositionFilename);
    }

    if (
      info.IsXFAPresent &&
      !info.IsAcroFormPresent &&
      !pdfDocument.isPureXfa
    ) {
      if (pdfDocument.loadingParams.enableXfa) {
        console.warn("Warning: XFA Foreground documents are not supported");
      } else {
        console.warn("Warning: XFA support is not enabled");
      }
    } else if (
      (info.IsAcroFormPresent || info.IsXFAPresent) &&
      !this.pdfViewer.renderForms
    ) {
      console.warn("Warning: Interactive form support is not enabled");
    }

    if (info.IsSignaturesPresent) {
      console.warn("Warning: Digital signatures validation is not supported");
    }

    this.eventBus.dispatch("metadataloaded", { source: this });
  },

  /**
   * @private
   */
  async _initializePageLabels(pdfDocument) {
    if (
      typeof PDFJSDev === "undefined"
        ? window.isGECKOVIEW
        : PDFJSDev.test("GECKOVIEW")
    ) {
      return;
    }
    const labels = await pdfDocument.getPageLabels();

    if (pdfDocument !== this.pdfDocument) {
      return; // The document was closed while the page labels resolved.
    }
    if (!labels || AppOptions.get("disablePageLabels")) {
      return;
    }
    const numLabels = labels.length;
    // Ignore page labels that correspond to standard page numbering,
    // or page labels that are all empty.
    let standardLabels = 0,
      emptyLabels = 0;
    for (let i = 0; i < numLabels; i++) {
      const label = labels[i];
      if (label === (i + 1).toString()) {
        standardLabels++;
      } else if (label === "") {
        emptyLabels++;
      } else {
        break;
      }
    }
    if (standardLabels >= numLabels || emptyLabels >= numLabels) {
      return;
    }
    const { pdfViewer, pdfThumbnailViewer, toolbar } = this;

    pdfViewer.setPageLabels(labels);
    pdfThumbnailViewer?.setPageLabels(labels);

    // Changing toolbar page display to use labels and we need to set
    // the label of the current page.
    toolbar?.setPagesCount(numLabels, true);
    toolbar?.setPageNumber(
      pdfViewer.currentPageNumber,
      pdfViewer.currentPageLabel
    );
  },

  /**
   * @private
   */
  _initializePdfHistory({ fingerprint, viewOnLoad, initialDest = null }) {
    if (!this.pdfHistory) {
      return;
    }
    this.pdfHistory.initialize({
      fingerprint,
      resetHistory: viewOnLoad === ViewOnLoad.INITIAL,
      updateUrl: AppOptions.get("historyUpdateUrl"),
    });

    if (this.pdfHistory.initialBookmark) {
      this.initialBookmark = this.pdfHistory.initialBookmark;

      this.initialRotation = this.pdfHistory.initialRotation;
    }

    // Always let the browser history/document hash take precedence.
    if (
      initialDest &&
      !this.initialBookmark &&
      viewOnLoad === ViewOnLoad.UNKNOWN
    ) {
      this.initialBookmark = JSON.stringify(initialDest);
      // TODO: Re-factor the `PDFHistory` initialization to remove this hack
      // that's currently necessary to prevent weird initial history state.
      this.pdfHistory.push({ explicitDest: initialDest, pageNumber: null });
    }
  },

  /**
   * @private
   */
  _initializeAnnotationStorageCallbacks(pdfDocument) {
    if (pdfDocument !== this.pdfDocument) {
      return;
    }
    const { annotationStorage } = pdfDocument;

    annotationStorage.onSetModified = () => {
      window.addEventListener("beforeunload", beforeUnload);

      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
        this._annotationStorageModified = true;
      }
    };
    annotationStorage.onResetModified = () => {
      window.removeEventListener("beforeunload", beforeUnload);

      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
        delete this._annotationStorageModified;
      }
    };
    annotationStorage.onAnnotationEditor = typeStr => {
      this._hasAnnotationEditors = !!typeStr;
      this.setTitle();
    };
  },

  setInitialView(
    storedHash,
    { rotation, sidebarView, scrollMode, spreadMode } = {}
  ) {
    const setRotation = angle => {
      if (isValidRotation(angle)) {
        this.pdfViewer.pagesRotation = angle;
      }
    };
    const setViewerModes = (scroll, spread) => {
      if (isValidScrollMode(scroll)) {
        this.pdfViewer.scrollMode = scroll;
      }
      if (isValidSpreadMode(spread)) {
        this.pdfViewer.spreadMode = spread;
      }
    };
    this.isInitialViewSet = true;
    this.pdfSidebar?.setInitialView(sidebarView);

    setViewerModes(scrollMode, spreadMode);

    if (this.initialBookmark) {
      setRotation(this.initialRotation);
      delete this.initialRotation;

      this.pdfLinkService.setHash(this.initialBookmark);
      this.initialBookmark = null;
    } else if (storedHash) {
      setRotation(rotation);

      this.pdfLinkService.setHash(storedHash);
    }

    // Ensure that the correct page number is displayed in the UI,
    // even if the active page didn't change during document load.
    this.toolbar?.setPageNumber(
      this.pdfViewer.currentPageNumber,
      this.pdfViewer.currentPageLabel
    );
    this.secondaryToolbar?.setPageNumber(this.pdfViewer.currentPageNumber);

    if (!this.pdfViewer.currentScaleValue) {
      // Scale was not initialized: invalid bookmark or scale was not specified.
      // Setting the default one.
      this.pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
    }
  },

  /**
   * @private
   */
  _cleanup() {
    if (!this.pdfDocument) {
      return; // run cleanup when document is loaded
    }
    this.pdfViewer.cleanup();
    this.pdfThumbnailViewer?.cleanup();

    this.pdfDocument.cleanup(
      /* keepLoadedFonts = */ AppOptions.get("fontExtraProperties")
    );
  },

  forceRendering() {
    this.pdfRenderingQueue.printing = !!this.printService;
    this.pdfRenderingQueue.isThumbnailViewEnabled =
      this.pdfSidebar?.visibleView === SidebarView.THUMBS;
    this.pdfRenderingQueue.renderHighestPriority();
  },

  beforePrint() {
    this._printAnnotationStoragePromise = this.pdfScriptingManager
      .dispatchWillPrint()
      .catch(() => {
        /* Avoid breaking printing; ignoring errors. */
      })
      .then(() => this.pdfDocument?.annotationStorage.print);

    if (this.printService) {
      // There is no way to suppress beforePrint/afterPrint events,
      // but PDFPrintService may generate double events -- this will ignore
      // the second event that will be coming from native window.print().
      return;
    }

    if (!this.supportsPrinting) {
      this._otherError("pdfjs-printing-not-supported");
      return;
    }

    // The beforePrint is a sync method and we need to know layout before
    // returning from this method. Ensure that we can get sizes of the pages.
    if (!this.pdfViewer.pageViewsReady) {
      this.l10n.get("pdfjs-printing-not-ready").then(msg => {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      });
      return;
    }

    this.printService = PDFPrintServiceFactory.createPrintService({
      pdfDocument: this.pdfDocument,
      pagesOverview: this.pdfViewer.getPagesOverview(),
      printContainer: this.appConfig.printContainer,
      printResolution: AppOptions.get("printResolution"),
      printAnnotationStoragePromise: this._printAnnotationStoragePromise,
    });
    this.forceRendering();
    // Disable the editor-indicator during printing (fixes bug 1790552).
    this.setTitle();

    this.printService.layout();

    if (this._hasAnnotationEditors) {
      this.externalServices.reportTelemetry({
        type: "editing",
        data: {
          type: "print",
          stats: this.pdfDocument?.annotationStorage.editorStats,
        },
      });
    }
  },

  afterPrint() {
    if (this._printAnnotationStoragePromise) {
      this._printAnnotationStoragePromise.then(() => {
        this.pdfScriptingManager.dispatchDidPrint();
      });
      this._printAnnotationStoragePromise = null;
    }

    if (this.printService) {
      this.printService.destroy();
      this.printService = null;

      this.pdfDocument?.annotationStorage.resetModified();
    }
    this.forceRendering();
    // Re-enable the editor-indicator after printing (fixes bug 1790552).
    this.setTitle();
  },

  rotatePages(delta) {
    this.pdfViewer.pagesRotation += delta;
    // Note that the thumbnail viewer is updated, and rendering is triggered,
    // in the 'rotationchanging' event handler.
  },

  requestPresentationMode() {
    this.pdfPresentationMode?.request();
  },

  triggerPrinting() {
    if (this.supportsPrinting) {
      window.print();
    }
  },

  bindEvents() {
    if (this._eventBusAbortController) {
      return;
    }
    const ac = (this._eventBusAbortController = new AbortController());
    const opts = { signal: ac.signal };

    const {
      eventBus,
      externalServices,
      pdfDocumentProperties,
      pdfViewer,
      preferences,
    } = this;

    eventBus._on("resize", onResize.bind(this), opts);
    eventBus._on("hashchange", onHashchange.bind(this), opts);
    eventBus._on("beforeprint", this.beforePrint.bind(this), opts);
    eventBus._on("afterprint", this.afterPrint.bind(this), opts);
    eventBus._on("pagerender", onPageRender.bind(this), opts);
    eventBus._on("pagerendered", onPageRendered.bind(this), opts);
    eventBus._on("updateviewarea", onUpdateViewarea.bind(this), opts);
    eventBus._on("pagechanging", onPageChanging.bind(this), opts);
    eventBus._on("scalechanging", onScaleChanging.bind(this), opts);
    eventBus._on("rotationchanging", onRotationChanging.bind(this), opts);
    eventBus._on("sidebarviewchanged", onSidebarViewChanged.bind(this), opts);
    eventBus._on("pagemode", onPageMode.bind(this), opts);
    eventBus._on("namedaction", onNamedAction.bind(this), opts);
    eventBus._on(
      "presentationmodechanged",
      evt => (pdfViewer.presentationModeState = evt.state),
      opts
    );
    eventBus._on(
      "presentationmode",
      this.requestPresentationMode.bind(this),
      opts
    );
    eventBus._on(
      "switchannotationeditormode",
      evt => (pdfViewer.annotationEditorMode = evt),
      opts
    );
    eventBus._on("print", this.triggerPrinting.bind(this), opts);
    eventBus._on("download", this.downloadOrSave.bind(this), opts);
    eventBus._on("firstpage", () => (this.page = 1), opts);
    eventBus._on("lastpage", () => (this.page = this.pagesCount), opts);
    eventBus._on("nextpage", () => pdfViewer.nextPage(), opts);
    eventBus._on("previouspage", () => pdfViewer.previousPage(), opts);
    eventBus._on("zoomin", this.zoomIn.bind(this), opts);
    eventBus._on("zoomout", this.zoomOut.bind(this), opts);
    eventBus._on("zoomreset", this.zoomReset.bind(this), opts);
    eventBus._on("pagenumberchanged", onPageNumberChanged.bind(this), opts);
    eventBus._on(
      "scalechanged",
      evt => (pdfViewer.currentScaleValue = evt.value),
      opts
    );
    eventBus._on("rotatecw", this.rotatePages.bind(this, 90), opts);
    eventBus._on("rotateccw", this.rotatePages.bind(this, -90), opts);
    eventBus._on(
      "optionalcontentconfig",
      evt => (pdfViewer.optionalContentConfigPromise = evt.promise),
      opts
    );
    eventBus._on(
      "switchscrollmode",
      evt => (pdfViewer.scrollMode = evt.mode),
      opts
    );
    eventBus._on(
      "scrollmodechanged",
      onViewerModesChanged.bind(this, "scrollMode"),
      opts
    );
    eventBus._on(
      "switchspreadmode",
      evt => (pdfViewer.spreadMode = evt.mode),
      opts
    );
    eventBus._on(
      "spreadmodechanged",
      onViewerModesChanged.bind(this, "spreadMode"),
      opts
    );
    eventBus._on(
      "imagealttextsettings",
      onImageAltTextSettings.bind(this),
      opts
    );
    eventBus._on(
      "documentproperties",
      () => pdfDocumentProperties?.open(),
      opts
    );
    eventBus._on("findfromurlhash", onFindFromUrlHash.bind(this), opts);
    eventBus._on(
      "updatefindmatchescount",
      onUpdateFindMatchesCount.bind(this),
      opts
    );
    eventBus._on(
      "updatefindcontrolstate",
      onUpdateFindControlState.bind(this),
      opts
    );

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      eventBus._on("fileinputchange", onFileInputChange.bind(this), opts);
      eventBus._on("openfile", onOpenFile.bind(this), opts);
    }
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      eventBus._on(
        "annotationeditorstateschanged",
        evt => externalServices.updateEditorStates(evt),
        opts
      );
      eventBus._on(
        "reporttelemetry",
        evt => externalServices.reportTelemetry(evt.details),
        opts
      );
    }
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("TESTING || MOZCENTRAL")
    ) {
      eventBus._on(
        "setpreference",
        evt => preferences.set(evt.name, evt.value),
        opts
      );
    }
  },

  bindWindowEvents() {
    if (this._windowAbortController) {
      return;
    }
    this._windowAbortController = new AbortController();

    const {
      eventBus,
      appConfig: { mainContainer },
      pdfViewer,
      _windowAbortController: { signal },
    } = this;

    if (
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      typeof AbortSignal.any === "function"
    ) {
      this._touchManager = new TouchManager({
        container: window,
        isPinchingDisabled: () => pdfViewer.isInPresentationMode,
        isPinchingStopped: () => this.overlayManager?.active,
        onPinching: this.touchPinchCallback.bind(this),
        onPinchEnd: this.touchPinchEndCallback.bind(this),
        signal,
      });
    }

    function addWindowResolutionChange(evt = null) {
      if (evt) {
        pdfViewer.refresh();
      }
      const mediaQueryList = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`
      );
      mediaQueryList.addEventListener("change", addWindowResolutionChange, {
        once: true,
        signal,
      });
    }
    addWindowResolutionChange();

    window.addEventListener("wheel", onWheel.bind(this), {
      passive: false,
      signal,
    });
    window.addEventListener("click", onClick.bind(this), { signal });
    window.addEventListener("keydown", onKeyDown.bind(this), { signal });
    window.addEventListener("keyup", onKeyUp.bind(this), { signal });
    window.addEventListener(
      "resize",
      () => eventBus.dispatch("resize", { source: window }),
      { signal }
    );
    window.addEventListener(
      "hashchange",
      () => {
        eventBus.dispatch("hashchange", {
          source: window,
          hash: document.location.hash.substring(1),
        });
      },
      { signal }
    );
    window.addEventListener(
      "beforeprint",
      () => eventBus.dispatch("beforeprint", { source: window }),
      { signal }
    );
    window.addEventListener(
      "afterprint",
      () => eventBus.dispatch("afterprint", { source: window }),
      { signal }
    );
    window.addEventListener(
      "updatefromsandbox",
      evt => {
        eventBus.dispatch("updatefromsandbox", {
          source: window,
          detail: evt.detail,
        });
      },
      { signal }
    );

    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !("onscrollend" in document.documentElement)
    ) {
      return;
    }
    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      // Using the values lastScrollTop and lastScrollLeft is a workaround to
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1881974.
      // TODO: remove them once the bug is fixed.
      ({ scrollTop: this._lastScrollTop, scrollLeft: this._lastScrollLeft } =
        mainContainer);
    }

    const scrollend = () => {
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
        ({ scrollTop: this._lastScrollTop, scrollLeft: this._lastScrollLeft } =
          mainContainer);
      }

      this._isScrolling = false;
      mainContainer.addEventListener("scroll", scroll, {
        passive: true,
        signal,
      });
      mainContainer.removeEventListener("scrollend", scrollend);
      mainContainer.removeEventListener("blur", scrollend);
    };
    const scroll = () => {
      if (this._isCtrlKeyDown) {
        return;
      }
      if (
        (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
        this._lastScrollTop === mainContainer.scrollTop &&
        this._lastScrollLeft === mainContainer.scrollLeft
      ) {
        return;
      }

      mainContainer.removeEventListener("scroll", scroll);
      this._isScrolling = true;
      mainContainer.addEventListener("scrollend", scrollend, { signal });
      mainContainer.addEventListener("blur", scrollend, { signal });
    };
    mainContainer.addEventListener("scroll", scroll, {
      passive: true,
      signal,
    });
  },

  unbindEvents() {
    this._eventBusAbortController?.abort();
    this._eventBusAbortController = null;
  },

  unbindWindowEvents() {
    this._windowAbortController?.abort();
    this._windowAbortController = null;
    this._touchManager = null;
  },

  /**
   * @ignore
   */
  async testingClose() {
    this.unbindEvents();
    this.unbindWindowEvents();

    this._globalAbortController?.abort();
    this._globalAbortController = null;

    this.findBar?.close();

    await Promise.all([this.l10n?.destroy(), this.close()]);
  },

  _accumulateTicks(ticks, prop) {
    // If the direction changed, reset the accumulated ticks.
    if ((this[prop] > 0 && ticks < 0) || (this[prop] < 0 && ticks > 0)) {
      this[prop] = 0;
    }
    this[prop] += ticks;
    const wholeTicks = Math.trunc(this[prop]);
    this[prop] -= wholeTicks;
    return wholeTicks;
  },

  _accumulateFactor(previousScale, factor, prop) {
    if (factor === 1) {
      return 1;
    }
    // If the direction changed, reset the accumulated factor.
    if ((this[prop] > 1 && factor < 1) || (this[prop] < 1 && factor > 1)) {
      this[prop] = 1;
    }

    const newFactor =
      Math.floor(previousScale * factor * this[prop] * 100) /
      (100 * previousScale);
    this[prop] = factor / newFactor;

    return newFactor;
  },

  /**
   * Should be called *after* all pages have loaded, or if an error occurred,
   * to unblock the "load" event; see https://bugzilla.mozilla.org/show_bug.cgi?id=1618553
   * @private
   */
  _unblockDocumentLoadEvent() {
    document.blockUnblockOnload?.(false);

    // Ensure that this method is only ever run once.
    this._unblockDocumentLoadEvent = () => {};
  },

  /**
   * Used together with the integration-tests, to enable awaiting full
   * initialization of the scripting/sandbox.
   */
  get scriptingReady() {
    return this.pdfScriptingManager.ready;
  },
};

initCom(PDFViewerApplication);

if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  PDFPrintServiceFactory.initGlobals(PDFViewerApplication);
}

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  const HOSTED_VIEWER_ORIGINS = [
    "null",
    "http://mozilla.github.io",
    "https://mozilla.github.io",
  ];
  // eslint-disable-next-line no-var
  var validateFileURL = function (file) {
    if (!file) {
      return;
    }
    try {
      const viewerOrigin = new URL(window.location.href).origin || "null";
      if (HOSTED_VIEWER_ORIGINS.includes(viewerOrigin)) {
        // Hosted or local viewer, allow for any file locations
        return;
      }
      const fileOrigin = new URL(file, window.location.href).origin;
      // Removing of the following line will not guarantee that the viewer will
      // start accepting URLs from foreign origin -- CORS headers on the remote
      // server must be properly configured.
      if (fileOrigin !== viewerOrigin) {
        throw new Error("file origin does not match viewer's");
      }
    } catch (ex) {
      PDFViewerApplication._documentError("pdfjs-loading-error", {
        message: ex.message,
      });
      throw ex;
    }
  };

  // eslint-disable-next-line no-var
  var onFileInputChange = function (evt) {
    if (this.pdfViewer?.isInPresentationMode) {
      return; // Opening a new PDF file isn't supported in Presentation Mode.
    }
    const file = evt.fileInput.files[0];

    this.open({
      url: URL.createObjectURL(file),
      originalUrl: file.name,
    });
  };

  // eslint-disable-next-line no-var
  var onOpenFile = function (evt) {
    this._openFileInput?.click();
  };
}

function onPageRender({ pageNumber }) {
  // If the page is (the most) visible when it starts rendering,
  // ensure that the page number input loading indicator is displayed.
  if (pageNumber === this.page) {
    this.toolbar?.updateLoadingIndicatorState(true);
  }
}

function onPageRendered({ pageNumber, error }) {
  // If the page is still visible when it has finished rendering,
  // ensure that the page number input loading indicator is hidden.
  if (pageNumber === this.page) {
    this.toolbar?.updateLoadingIndicatorState(false);
  }

  // Use the rendered page to set the corresponding thumbnail image.
  if (this.pdfSidebar?.visibleView === SidebarView.THUMBS) {
    const pageView = this.pdfViewer.getPageView(/* index = */ pageNumber - 1);
    const thumbnailView = this.pdfThumbnailViewer?.getThumbnail(
      /* index = */ pageNumber - 1
    );
    if (pageView) {
      thumbnailView?.setImage(pageView);
    }
  }

  if (error) {
    this._otherError("pdfjs-rendering-error", error);
  }
}

function onPageMode({ mode }) {
  // Handle the 'pagemode' hash parameter, see also `PDFLinkService_setHash`.
  let view;
  switch (mode) {
    case "thumbs":
      view = SidebarView.THUMBS;
      break;
    case "bookmarks":
    case "outline": // non-standard
      view = SidebarView.OUTLINE;
      break;
    case "attachments": // non-standard
      view = SidebarView.ATTACHMENTS;
      break;
    case "layers": // non-standard
      view = SidebarView.LAYERS;
      break;
    case "none":
      view = SidebarView.NONE;
      break;
    default:
      console.error('Invalid "pagemode" hash parameter: ' + mode);
      return;
  }
  this.pdfSidebar?.switchView(view, /* forceOpen = */ true);
}

function onNamedAction(evt) {
  // Processing a couple of named actions that might be useful, see also
  // `PDFLinkService.executeNamedAction`.
  switch (evt.action) {
    case "GoToPage":
      this.appConfig.toolbar?.pageNumber.select();
      break;

    case "Find":
      if (!this.supportsIntegratedFind) {
        this.findBar?.toggle();
      }
      break;

    case "Print":
      this.triggerPrinting();
      break;

    case "SaveAs":
      this.downloadOrSave();
      break;
  }
}

function onSidebarViewChanged({ view }) {
  this.pdfRenderingQueue.isThumbnailViewEnabled = view === SidebarView.THUMBS;

  if (this.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    this.store?.set("sidebarView", view).catch(() => {
      // Unable to write to storage.
    });
  }
}

function onUpdateViewarea({ location }) {
  if (this.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    this.store
      ?.setMultiple({
        page: location.pageNumber,
        zoom: location.scale,
        scrollLeft: location.left,
        scrollTop: location.top,
        rotation: location.rotation,
      })
      .catch(() => {
        // Unable to write to storage.
      });
  }
  if (this.appConfig.secondaryToolbar) {
    this.appConfig.secondaryToolbar.viewBookmarkButton.href =
      this.pdfLinkService.getAnchorUrl(location.pdfOpenParams);
  }
}

function onViewerModesChanged(name, evt) {
  if (this.isInitialViewSet && !this.pdfViewer.isInPresentationMode) {
    // Only update the storage when the document has been loaded *and* rendered.
    this.store?.set(name, evt.mode).catch(() => {
      // Unable to write to storage.
    });
  }
}

function onResize() {
  const { pdfDocument, pdfViewer, pdfRenderingQueue } = this;

  if (pdfRenderingQueue.printing && window.matchMedia("print").matches) {
    // Work-around issue 15324 by ignoring "resize" events during printing.
    return;
  }

  if (!pdfDocument) {
    return;
  }
  const currentScaleValue = pdfViewer.currentScaleValue;
  if (
    currentScaleValue === "auto" ||
    currentScaleValue === "page-fit" ||
    currentScaleValue === "page-width"
  ) {
    // Note: the scale is constant for 'page-actual'.
    pdfViewer.currentScaleValue = currentScaleValue;
  }
  pdfViewer.update();
}

function onHashchange(evt) {
  const hash = evt.hash;
  if (!hash) {
    return;
  }
  if (!this.isInitialViewSet) {
    this.initialBookmark = hash;
  } else if (!this.pdfHistory?.popStateInProgress) {
    this.pdfLinkService.setHash(hash);
  }
}

function onPageNumberChanged(evt) {
  const { pdfViewer } = this;
  // Note that for `<input type="number">` HTML elements, an empty string will
  // be returned for non-number inputs; hence we simply do nothing in that case.
  if (evt.value !== "") {
    this.pdfLinkService.goToPage(evt.value);
  }

  // Ensure that the page number input displays the correct value, even if the
  // value entered by the user was invalid (e.g. a floating point number).
  if (
    evt.value !== pdfViewer.currentPageNumber.toString() &&
    evt.value !== pdfViewer.currentPageLabel
  ) {
    this.toolbar?.setPageNumber(
      pdfViewer.currentPageNumber,
      pdfViewer.currentPageLabel
    );
  }
}

function onImageAltTextSettings() {
  this.imageAltTextSettings?.open({
    enableGuessAltText: AppOptions.get("enableGuessAltText"),
    enableNewAltTextWhenAddingImage: AppOptions.get(
      "enableNewAltTextWhenAddingImage"
    ),
  });
}

function onFindFromUrlHash(evt) {
  this.eventBus.dispatch("find", {
    source: evt.source,
    type: "",
    query: evt.query,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false,
    matchDiacritics: true,
  });
}

function onUpdateFindMatchesCount({ matchesCount }) {
  if (this.supportsIntegratedFind) {
    this.externalServices.updateFindMatchesCount(matchesCount);
  } else {
    this.findBar?.updateResultsCount(matchesCount);
  }
}

function onUpdateFindControlState({
  state,
  previous,
  entireWord,
  matchesCount,
  rawQuery,
}) {
  if (this.supportsIntegratedFind) {
    this.externalServices.updateFindControlState({
      result: state,
      findPrevious: previous,
      entireWord,
      matchesCount,
      rawQuery,
    });
  } else {
    this.findBar?.updateUIState(state, previous, matchesCount);
  }
}

function onScaleChanging(evt) {
  this.toolbar?.setPageScale(evt.presetValue, evt.scale);

  this.pdfViewer.update();
}

function onRotationChanging(evt) {
  if (this.pdfThumbnailViewer) {
    this.pdfThumbnailViewer.pagesRotation = evt.pagesRotation;
  }

  this.forceRendering();
  // Ensure that the active page doesn't change during rotation.
  this.pdfViewer.currentPageNumber = evt.pageNumber;
}

function onPageChanging({ pageNumber, pageLabel }) {
  this.toolbar?.setPageNumber(pageNumber, pageLabel);
  this.secondaryToolbar?.setPageNumber(pageNumber);

  if (this.pdfSidebar?.visibleView === SidebarView.THUMBS) {
    this.pdfThumbnailViewer?.scrollThumbnailIntoView(pageNumber);
  }

  // Show/hide the loading indicator in the page number input element.
  const currentPage = this.pdfViewer.getPageView(/* index = */ pageNumber - 1);
  this.toolbar?.updateLoadingIndicatorState(
    currentPage?.renderingState === RenderingStates.RUNNING
  );
}

function onWheel(evt) {
  const {
    pdfViewer,
    supportsMouseWheelZoomCtrlKey,
    supportsMouseWheelZoomMetaKey,
    supportsPinchToZoom,
  } = this;

  if (pdfViewer.isInPresentationMode) {
    return;
  }

  // Pinch-to-zoom on a trackpad maps to a wheel event with ctrlKey set to true
  // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent#browser_compatibility
  // Hence if ctrlKey is true but ctrl key hasn't been pressed then we can
  // infer that we have a pinch-to-zoom.
  // But the ctrlKey could have been pressed outside of the browser window,
  // hence we try to do some magic to guess if the scaleFactor is likely coming
  // from a pinch-to-zoom or not.

  // It is important that we query deltaMode before delta{X,Y}, so that
  // Firefox doesn't switch to DOM_DELTA_PIXEL mode for compat with other
  // browsers, see https://bugzilla.mozilla.org/show_bug.cgi?id=1392460.
  const deltaMode = evt.deltaMode;

  // The following formula is a bit strange but it comes from:
  // https://searchfox.org/mozilla-central/rev/d62c4c4d5547064487006a1506287da394b64724/widget/InputData.cpp#618-626
  let scaleFactor = Math.exp(-evt.deltaY / 100);

  const isBuiltInMac =
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("MOZCENTRAL") &&
    FeatureTest.platform.isMac;
  const isPinchToZoom =
    evt.ctrlKey &&
    !this._isCtrlKeyDown &&
    deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
    evt.deltaX === 0 &&
    (Math.abs(scaleFactor - 1) < 0.05 || isBuiltInMac) &&
    evt.deltaZ === 0;
  const origin = [evt.clientX, evt.clientY];

  if (
    isPinchToZoom ||
    (evt.ctrlKey && supportsMouseWheelZoomCtrlKey) ||
    (evt.metaKey && supportsMouseWheelZoomMetaKey)
  ) {
    // Only zoom the pages, not the entire viewer.
    evt.preventDefault();
    // NOTE: this check must be placed *after* preventDefault.
    if (
      this._isScrolling ||
      document.visibilityState === "hidden" ||
      this.overlayManager.active
    ) {
      return;
    }

    if (isPinchToZoom && supportsPinchToZoom) {
      scaleFactor = this._accumulateFactor(
        pdfViewer.currentScale,
        scaleFactor,
        "_wheelUnusedFactor"
      );
      this.updateZoom(null, scaleFactor, origin);
    } else {
      const delta = normalizeWheelEventDirection(evt);

      let ticks = 0;
      if (
        deltaMode === WheelEvent.DOM_DELTA_LINE ||
        deltaMode === WheelEvent.DOM_DELTA_PAGE
      ) {
        // For line-based devices, use one tick per event, because different
        // OSs have different defaults for the number lines. But we generally
        // want one "clicky" roll of the wheel (which produces one event) to
        // adjust the zoom by one step.
        //
        // If we're getting fractional lines (I can't think of a scenario
        // this might actually happen), be safe and use the accumulator.
        ticks =
          Math.abs(delta) >= 1
            ? Math.sign(delta)
            : this._accumulateTicks(delta, "_wheelUnusedTicks");
      } else {
        // pixel-based devices
        const PIXELS_PER_LINE_SCALE = 30;
        ticks = this._accumulateTicks(
          delta / PIXELS_PER_LINE_SCALE,
          "_wheelUnusedTicks"
        );
      }

      this.updateZoom(ticks, null, origin);
    }
  }
}

function closeSecondaryToolbar(evt) {
  if (!this.secondaryToolbar?.isOpen) {
    return;
  }
  const appConfig = this.appConfig;
  if (
    this.pdfViewer.containsElement(evt.target) ||
    (appConfig.toolbar?.container.contains(evt.target) &&
      // TODO: change the `contains` for an equality check when the bug:
      //  https://bugzilla.mozilla.org/show_bug.cgi?id=1921984
      // is fixed.
      !appConfig.secondaryToolbar?.toggleButton.contains(evt.target))
  ) {
    this.secondaryToolbar.close();
  }
}

function closeEditorUndoBar(evt) {
  if (!this.editorUndoBar?.isOpen) {
    return;
  }
  if (this.appConfig.secondaryToolbar?.toolbar.contains(evt.target)) {
    this.editorUndoBar.hide();
  }
}

function onClick(evt) {
  closeSecondaryToolbar.call(this, evt);
  closeEditorUndoBar.call(this, evt);
}

function onKeyUp(evt) {
  // evt.ctrlKey is false hence we use evt.key.
  if (evt.key === "Control") {
    this._isCtrlKeyDown = false;
  }
}

function onKeyDown(evt) {
  this._isCtrlKeyDown = evt.key === "Control";

  if (
    this.editorUndoBar?.isOpen &&
    evt.keyCode !== 9 &&
    evt.keyCode !== 16 &&
    !(
      (evt.keyCode === 13 || evt.keyCode === 32) &&
      getActiveOrFocusedElement() === this.appConfig.editorUndoBar.undoButton
    )
  ) {
    // Hide undo bar on keypress except for Shift, Tab, Shift+Tab.
    // Also avoid hiding if the undo button is triggered.
    this.editorUndoBar.hide();
  }

  if (this.overlayManager.active) {
    return;
  }
  const { eventBus, pdfViewer } = this;
  const isViewerInPresentationMode = pdfViewer.isInPresentationMode;

  let handled = false,
    ensureViewerFocused = false;
  const cmd =
    (evt.ctrlKey ? 1 : 0) |
    (evt.altKey ? 2 : 0) |
    (evt.shiftKey ? 4 : 0) |
    (evt.metaKey ? 8 : 0);

  // First, handle the key bindings that are independent whether an input
  // control is selected or not.
  if (cmd === 1 || cmd === 8 || cmd === 5 || cmd === 12) {
    // either CTRL or META key with optional SHIFT.
    switch (evt.keyCode) {
      case 70: // f
        if (!this.supportsIntegratedFind && !evt.shiftKey) {
          this.findBar?.open();
          handled = true;
        }
        break;
      case 71: // g
        if (!this.supportsIntegratedFind) {
          const { state } = this.findController;
          if (state) {
            const newState = {
              source: window,
              type: "again",
              findPrevious: cmd === 5 || cmd === 12,
            };
            eventBus.dispatch("find", { ...state, ...newState });
          }
          handled = true;
        }
        break;
      case 61: // FF/Mac '='
      case 107: // FF '+' and '='
      case 187: // Chrome '+'
      case 171: // FF with German keyboard
        this.zoomIn();
        handled = true;
        break;
      case 173: // FF/Mac '-'
      case 109: // FF '-'
      case 189: // Chrome '-'
        this.zoomOut();
        handled = true;
        break;
      case 48: // '0'
      case 96: // '0' on Numpad of Swedish keyboard
        if (!isViewerInPresentationMode) {
          // keeping it unhandled (to restore page zoom to 100%)
          setTimeout(() => {
            // ... and resetting the scale after browser adjusts its scale
            this.zoomReset();
          });
          handled = false;
        }
        break;

      case 38: // up arrow
        if (isViewerInPresentationMode || this.page > 1) {
          this.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
      case 40: // down arrow
        if (isViewerInPresentationMode || this.page < this.pagesCount) {
          this.page = this.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
    }
  }

  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC || CHROME")) {
    // CTRL or META without shift
    if (cmd === 1 || cmd === 8) {
      switch (evt.keyCode) {
        case 83: // s
          eventBus.dispatch("download", { source: window });
          handled = true;
          break;

        case 79: // o
          if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
            eventBus.dispatch("openfile", { source: window });
            handled = true;
          }
          break;
      }
    }
  }

  // CTRL+ALT or Option+Command
  if (cmd === 3 || cmd === 10) {
    switch (evt.keyCode) {
      case 80: // p
        this.requestPresentationMode();
        handled = true;
        this.externalServices.reportTelemetry({
          type: "buttons",
          data: { id: "presentationModeKeyboard" },
        });
        break;
      case 71: // g
        // focuses input#pageNumber field
        if (this.appConfig.toolbar) {
          this.appConfig.toolbar.pageNumber.select();
          handled = true;
        }
        break;
    }
  }

  if (handled) {
    if (ensureViewerFocused && !isViewerInPresentationMode) {
      pdfViewer.focus();
    }
    evt.preventDefault();
    return;
  }

  // Some shortcuts should not get handled if a control/input element
  // is selected.
  const curElement = getActiveOrFocusedElement();
  const curElementTagName = curElement?.tagName.toUpperCase();
  if (
    curElementTagName === "INPUT" ||
    curElementTagName === "TEXTAREA" ||
    curElementTagName === "SELECT" ||
    (curElementTagName === "BUTTON" &&
      (evt.keyCode === /* Enter = */ 13 || evt.keyCode === /* Space = */ 32)) ||
    curElement?.isContentEditable
  ) {
    // Make sure that the secondary toolbar is closed when Escape is pressed.
    if (evt.keyCode !== /* Esc = */ 27) {
      return;
    }
  }

  // No control key pressed at all.
  if (cmd === 0) {
    let turnPage = 0,
      turnOnlyIfPageFit = false;
    switch (evt.keyCode) {
      case 38: // up arrow
        if (this.supportsCaretBrowsingMode) {
          this.moveCaret(/* isUp = */ true, /* select = */ false);
          handled = true;
          break;
        }
      /* falls through */
      case 33: // pg up
        // vertical scrolling using arrow/pg keys
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
        turnPage = -1;
        break;
      case 8: // backspace
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }
        turnPage = -1;
        break;
      case 37: // left arrow
        if (this.supportsCaretBrowsingMode) {
          return;
        }
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
      /* falls through */
      case 75: // 'k'
      case 80: // 'p'
        turnPage = -1;
        break;
      case 27: // esc key
        if (this.secondaryToolbar?.isOpen) {
          this.secondaryToolbar.close();
          handled = true;
        }
        if (!this.supportsIntegratedFind && this.findBar?.opened) {
          this.findBar.close();
          handled = true;
        }
        break;
      case 40: // down arrow
        if (this.supportsCaretBrowsingMode) {
          this.moveCaret(/* isUp = */ false, /* select = */ false);
          handled = true;
          break;
        }
      /* falls through */
      case 34: // pg down
        // vertical scrolling using arrow/pg keys
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
        turnPage = 1;
        break;
      case 13: // enter key
      case 32: // spacebar
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }
        turnPage = 1;
        break;
      case 39: // right arrow
        if (this.supportsCaretBrowsingMode) {
          return;
        }
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
      /* falls through */
      case 74: // 'j'
      case 78: // 'n'
        turnPage = 1;
        break;

      case 36: // home
        if (isViewerInPresentationMode || this.page > 1) {
          this.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
      case 35: // end
        if (isViewerInPresentationMode || this.page < this.pagesCount) {
          this.page = this.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }
        break;

      case 83: // 's'
        this.pdfCursorTools?.switchTool(CursorTool.SELECT);
        break;
      case 72: // 'h'
        this.pdfCursorTools?.switchTool(CursorTool.HAND);
        break;

      case 82: // 'r'
        this.rotatePages(90);
        break;

      case 115: // F4
        this.pdfSidebar?.toggle();
        break;
    }

    if (
      turnPage !== 0 &&
      (!turnOnlyIfPageFit || pdfViewer.currentScaleValue === "page-fit")
    ) {
      if (turnPage > 0) {
        pdfViewer.nextPage();
      } else {
        pdfViewer.previousPage();
      }
      handled = true;
    }
  }

  // shift-key
  if (cmd === 4) {
    switch (evt.keyCode) {
      case 13: // enter key
      case 32: // spacebar
        if (
          !isViewerInPresentationMode &&
          pdfViewer.currentScaleValue !== "page-fit"
        ) {
          break;
        }
        pdfViewer.previousPage();

        handled = true;
        break;

      case 38: // up arrow
        this.moveCaret(/* isUp = */ true, /* select = */ true);
        handled = true;
        break;
      case 40: // down arrow
        this.moveCaret(/* isUp = */ false, /* select = */ true);
        handled = true;
        break;
      case 82: // 'r'
        this.rotatePages(-90);
        break;
    }
  }

  if (!handled && !isViewerInPresentationMode) {
    // 33=Page Up  34=Page Down  35=End    36=Home
    // 37=Left     38=Up         39=Right  40=Down
    // 32=Spacebar
    if (
      (evt.keyCode >= 33 && evt.keyCode <= 40) ||
      (evt.keyCode === 32 && curElementTagName !== "BUTTON")
    ) {
      ensureViewerFocused = true;
    }
  }

  if (ensureViewerFocused && !pdfViewer.containsElement(curElement)) {
    // The page container is not focused, but a page navigation key has been
    // pressed. Change the focus to the viewer container to make sure that
    // navigation by keyboard works as expected.
    pdfViewer.focus();
  }

  if (handled) {
    evt.preventDefault();
  }
}

function beforeUnload(evt) {
  // evt.preventDefault();
  // evt.returnValue = "";
  return false;
}

export { PDFViewerApplication };



// // Option 1: Wait for PDFViewerApplication to be fully initialized
// document.addEventListener("DOMContentLoaded", async () => {
//   const app = PDFViewerApplication;
  
//   // Wait for the app to be initialized
//   await app.initializedPromise;
  

//   // You can also listen for other events
//   app.eventBus._on("annotationeditorstateschanged", (evt) => {
//     console.log("statechanges:", evt);
//   });
// });


document.addEventListener("DOMContentLoaded", async () => {
  const app = PDFViewerApplication;

  // Wait for the PDF.js application to initialize
  await app.initializedPromise;

  let storageKey = null;

  // Utility for handling highlight storage
  const HighlightStorage = {
    save: (highlights, fingerprint) => {
      try {
        const key = `pdf_highlights_${fingerprint}`;
        localStorage.setItem(key, JSON.stringify(highlights));
        console.log(`Saved ${highlights.length} highlights to localStorage`);
      } catch (error) {
        console.error("Error saving highlights:", error);
      }
    },
    load: (fingerprint) => {
      try {
        const key = `pdf_highlights_${fingerprint}`;
        const data = localStorage.getItem(key);
        if (data) {
          const highlights = JSON.parse(data);
          console.log(`Loaded ${highlights.length} highlights from localStorage`);
          return highlights;
        }
      } catch (error) {
        console.error("Error loading highlights:", error);
      }
      return [];
    },
    clear: (fingerprint) => {
      try {
        const key = `pdf_highlights_${fingerprint}`;
        localStorage.removeItem(key);
        console.log("Cleared highlights from localStorage");
      } catch (error) {
        console.error("Error clearing highlights:", error);
      }
    },
  };

  // Extract highlights from annotation storage
  const extractHighlights = (annotationStorage) => {
    const highlights = [];
    if (annotationStorage && annotationStorage.getAll) {
      const entries = annotationStorage.getAll();
      if (entries && typeof entries === "object") {
        for (const [key, annotation] of Object.entries(entries)) {
          if (
            annotation &&
            (annotation.name === "highlightEditor" ||
              annotation.constructor?.name === "HighlightEditor")
          ) {
            highlights.push({
              id: key,
              serializedData: annotation,
            });
          }
        }
      }
    }
    return highlights;
  };

  // Restore highlights into annotation storage
const restoreHighlights = async (highlights, annotationStorage) => {

  console.log(annotationStorage.getAll())
  if (!highlights || highlights.length === 0) return;

  const pdfViewer = app.pdfViewer;

  for (const highlight of highlights) {
    try {
      const pageIndex = highlight.serializedData?.pageIndex;
      if (pageIndex == null) continue;

      const pageView = pdfViewer.getPageView(pageIndex);
      if (!pageView) continue;

      await pageView.draw(); // Ensure page is fully rendered

      const editorLayer = pageView.annotationEditorLayer;
      if (!editorLayer) continue;

      // Create new highlight editor from serialized data
      const HighlightEditorClass = PDFJSAnnotationEditorHighlight || window.HighlightEditor;
      if (!HighlightEditorClass) {
        console.warn("HighlightEditor class not found.");
        continue;
      }

      const editor = new HighlightEditorClass({
        parent: editorLayer,
        uiManager: editorLayer.uiManager,
      });

      // Deserialize and add to editor layer
      editor.deserialize(highlight.serializedData);
      editorLayer.addOrRebuild(editor);
    } catch (error) {
      console.error("Error restoring highlight visually:", error);
    }
  }

  console.log("Visual highlight restoration completed",annotationStorage.getAll());


};


  // Monitor changes to annotation storage
  const monitorAnnotationStorage = () => {
    if (app.pdfDocument && app.pdfDocument.annotationStorage) {
      const annotationStorage = app.pdfDocument.annotationStorage;

      const originalSetValue = annotationStorage.setValue.bind(annotationStorage);
      annotationStorage.setValue = function (key, value) {
        const result = originalSetValue(key, value);
        if (storageKey) {
          setTimeout(() => {
            const highlights = extractHighlights(annotationStorage);
            HighlightStorage.save(highlights, storageKey);
          }, 500);
        }
        return result;
      };

      const originalRemove = annotationStorage.remove.bind(annotationStorage);
      annotationStorage.remove = function (key) {
        const result = originalRemove(key);
        if (storageKey) {
          setTimeout(() => {
            const highlights = extractHighlights(annotationStorage);
            HighlightStorage.save(highlights, storageKey);
          }, 500);
        }
        return result;
      };
    }
  };

  // Handle document load event
  app.eventBus._on("documentloaded", async () => {
    if (app.pdfDocument) {
      const fingerprints = app.pdfDocument.fingerprints;
      const pdfFingerprint = fingerprints[0] || "unknown";
      storageKey = pdfFingerprint;

      const savedHighlights = HighlightStorage.load(pdfFingerprint);
      if (savedHighlights.length > 0) {
        await restoreHighlights(savedHighlights, app.pdfDocument.annotationStorage);
      }
    }

    monitorAnnotationStorage();
  });

  // Save highlights before unloading the page
  window.addEventListener("beforeunload", () => {
    if (app.pdfDocument && storageKey) {
      const highlights = extractHighlights(app.pdfDocument.annotationStorage);
      HighlightStorage.save(highlights, storageKey);
    }
  });

  // Expose utility functions for manual operations
  window.PDFHighlightManager = {
    saveHighlights: () => {
      if (app.pdfDocument && storageKey) {
        const highlights = extractHighlights(app.pdfDocument.annotationStorage);
        HighlightStorage.save(highlights, storageKey);
        console.log("Manual save completed");
        return highlights;
      }
    },
    loadHighlights: async () => {
      if (storageKey) {
        const highlights = HighlightStorage.load(storageKey);
        await restoreHighlights(highlights, app.pdfDocument.annotationStorage);
        console.log("Manual load completed");
        return highlights;
      }
    },
    clearHighlights: () => {
      if (storageKey) {
        HighlightStorage.clear(storageKey);
        if (app.pdfDocument && app.pdfDocument.annotationStorage) {
          const annotationStorage = app.pdfDocument.annotationStorage;
          const entries = annotationStorage.getAll();
          if (entries && typeof entries === "object") {
            for (const [key, annotation] of Object.entries(entries)) {
              if (
                annotation &&
                (annotation.name === "highlightEditor" ||
                  annotation.constructor?.name === "HighlightEditor")
              ) {
                annotationStorage.remove(key);
              }
            }
          }
          app.pdfViewer.update();
        }
        console.log("Highlights cleared");
      }
    },
    getStoredHighlights: () => {
      if (storageKey) {
        return HighlightStorage.load(storageKey);
      }
      return [];
    },
    getCurrentHighlights: () => {
      if (app.pdfDocument) {
        return extractHighlights(app.pdfDocument.annotationStorage);
      }
      return [];
    },
    debugStorage: () => {
      if (app.pdfDocument && app.pdfDocument.annotationStorage) {
        console.log("Current annotation storage:", app.pdfDocument.annotationStorage.getAll());
        const highlights = extractHighlights(app.pdfDocument.annotationStorage);
        console.log("Extracted highlights:", highlights);
        return {
          storage: app.pdfDocument.annotationStorage.getAll(),
          highlights: highlights,
        };
      }
    },
  };

  console.log("PDF Highlight Manager initialized");
  console.log("Use window.PDFHighlightManager for manual operations");
  console.log(
    "Available methods: saveHighlights(), loadHighlights(), clearHighlights(), getStoredHighlights(), getCurrentHighlights(), debugStorage()"
  );
});





console.log('PDF Analytics Core loaded. Use initializePDFAnalytics() to start tracking.');

/**
 * Real-time Analytics Tracker Class
 * Handles the core analytics data and calculations
 */
class RealTimeAnalyticsTracker {
  constructor(config) {
    this.config = config;
    this.sessionStartTime = Date.now();
    this.pageStartTime = Date.now();
    this.sectionStartTime = Date.now();
    this.lastActivityTime = Date.now();
    
    // Data storage
    this.pageData = {};
    this.sectionData = {};
    this.textSelections = [];
    this.pageChanges = [];
    this.readingEvents = [];
    
    // Current state
    this.currentPage = config.currentPage || 1;
    this.currentSection = config.currentSection;
    this.isActive = true;
    
    // Section detection cache
    this.sectionCache = new Map();
    this.lastSectionUpdate = 0;
    
    // Initialize page and section data
    this.initializeData();
    
    // Start activity monitoring
    this.startActivityMonitoring();
    
    console.log('RealTimeAnalyticsTracker initialized');
  }

  initializeData() {
    // Initialize page data
    for (let page = 1; page <= this.config.totalPages; page++) {
      this.pageData[page] = {
        pageNumber: page,
        timeSpent: 0,
        visits: 0,
        wordsRead: 0,
        completed: false,
        lastVisited: null,
        readingSpeed: 0
      };
    }
    
    // Initialize section data with better structure
    this.config.outlineStructure.forEach(section => {
      this.sectionData[section.id] = {
        id: section.id,
        title: section.title,
        page: section.page,
        endPage: section.endPage || section.page,
        timeSpent: 0,
        visits: 0,
        completed: false,
        wordsRead: 0,
        startTime: null,
        endTime: null,
        pagesInSection: []
      };
      
      // Calculate pages in section
      for (let p = section.page; p <= (section.endPage || section.page); p++) {
        this.sectionData[section.id].pagesInSection.push(p);
      }
    });
  }

  startActivityMonitoring() {
    // Track user activity with throttling
    const activityEvents = ['click', 'scroll', 'keypress', 'mousemove'];
    let activityThrottle;
    
    const handleActivity = () => {
      clearTimeout(activityThrottle);
      activityThrottle = setTimeout(() => {
        this.lastActivityTime = Date.now();
        this.isActive = true;
      }, 100);
    };
    
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });
    
    // Check for inactivity every 5 seconds
    setInterval(() => {
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      if (timeSinceActivity > 30000) { // 30 seconds
        this.isActive = false;
      }
    }, 5000);
  }

  recordPageChange(fromPage, toPage) {
    const now = Date.now();
    
    // Record time spent on previous page
    if (fromPage && this.pageStartTime && this.isActive) {
      const timeSpent = now - this.pageStartTime;
      if (timeSpent > 0 && timeSpent < 300000) { // Cap at 5 minutes per page
        this.pageData[fromPage].timeSpent += timeSpent;
        this.pageData[fromPage].completed = this.pageData[fromPage].timeSpent >= 3000;
      }
    }
    
    // Update page visits
    if (this.pageData[toPage]) {
      this.pageData[toPage].visits += 1;
      this.pageData[toPage].lastVisited = now;
    }
    
    // Record page change event
    const changeType = this.getPageChangeType(fromPage, toPage);
    this.pageChanges.push({
      fromPage,
      toPage,
      timestamp: now,
      type: changeType
    });
    
    // Update page start time
    this.pageStartTime = now;
    this.currentPage = toPage;
    
    console.log(`Page change recorded: ${fromPage} -> ${toPage} (${changeType})`);
  }

  getPageChangeType(fromPage, toPage) {
    if (!fromPage || !toPage) return 'initial';
    const diff = toPage - fromPage;
    if (diff === 1) return 'forward';
    if (diff === -1) return 'backward';
    if (Math.abs(diff) > 1) return 'jump';
    return 'same';
  }

  recordSectionChange(fromSection, toSection) {
    const now = Date.now();
    
    // Prevent too frequent section changes
    if (now - this.lastSectionUpdate < 1000) return;
    this.lastSectionUpdate = now;
    
    // End previous section
    if (fromSection && this.sectionStartTime && this.isActive) {
      const timeSpent = now - this.sectionStartTime;
      if (timeSpent > 0 && timeSpent < 300000) { // Cap at 5 minutes
        this.sectionData[fromSection.id].timeSpent += timeSpent;
        this.sectionData[fromSection.id].endTime = now;
        
        // Check if section is completed
        const sectionPages = this.sectionData[fromSection.id].pagesInSection;
        const pagesRead = sectionPages.filter(p => this.pageData[p] && this.pageData[p].completed).length;
        this.sectionData[fromSection.id].completed = pagesRead >= sectionPages.length * 0.8;
        
        console.log(`Section ${fromSection.title} time updated: ${timeSpent}ms (total: ${this.sectionData[fromSection.id].timeSpent}ms)`);
      }
    }
    
    // Start new section
    if (toSection && this.sectionData[toSection.id]) {
      this.sectionData[toSection.id].visits += 1;
      this.sectionData[toSection.id].startTime = now;
      this.sectionStartTime = now;
      this.currentSection = toSection;
      
      console.log(`Started tracking section: ${toSection.title}`);
    }
  }

  recordTextSelection(selectionData) {
    // Validate selection data
    if (!selectionData || !selectionData.text || selectionData.text.length < 3) return;
    
    this.textSelections.push({
      ...selectionData,
      id: `selection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // Keep only last 100 selections
    if (this.textSelections.length > 100) {
      this.textSelections = this.textSelections.slice(-100);
    }
    
    console.log(`Text selection recorded: ${selectionData.text.substring(0, 50)}...`);
  }

  getAnalytics() {
    const now = Date.now();
    const sessionTime = now - this.sessionStartTime;
    
    // Update current page time if active
    if (this.pageStartTime && this.currentPage && this.pageData[this.currentPage] && this.isActive) {
      const currentPageTime = Math.min(now - this.pageStartTime, 300000);
      this.pageData[this.currentPage].timeSpent += currentPageTime;
      this.pageStartTime = now;
    }
    
    // Update current section time if active
    if (this.sectionStartTime && this.currentSection && this.sectionData[this.currentSection.id] && this.isActive) {
      const currentSectionTime = Math.min(now - this.sectionStartTime, 300000);
      this.sectionData[this.currentSection.id].timeSpent += currentSectionTime;
      this.sectionStartTime = now;
    }
    
    // Calculate active time
    const activeTime = Object.values(this.pageData).reduce((sum, page) => sum + (page.timeSpent || 0), 0);
    
    // Calculate pages read
    const pagesRead = Object.values(this.pageData).filter(page => page.completed).length;
    
    // Calculate sections completed
    const sectionsCompleted = Object.values(this.sectionData).filter(section => section.completed).length;
    
    // Calculate reading patterns
    const forwardMoves = this.pageChanges.filter(change => change.type === 'forward').length;
    const backwardMoves = this.pageChanges.filter(change => change.type === 'backward').length;
    const jumpMoves = this.pageChanges.filter(change => change.type === 'jump').length;
    const totalMoves = forwardMoves + backwardMoves + jumpMoves;
    
    // Calculate words read
    const wordsFromSelections = this.textSelections.reduce((sum, selection) => {
      const words = selection.text.split(/\s+/).filter(word => word.length > 0);
      return sum + words.length;
    }, 0);
    
    const estimatedWordsPerPage = this.config.averageWordsPerPage || 275;
    const estimatedWordsRead = pagesRead * estimatedWordsPerPage;
    const totalWordsRead = Math.max(wordsFromSelections, estimatedWordsRead);
    
    // Calculate reading speed
    const activeTimeMinutes = activeTime / 60000;
    const readingSpeed = activeTimeMinutes > 0 ? Math.round(totalWordsRead / activeTimeMinutes) : 0;
    
    // Current section time
    const currentSectionTime = this.currentSection && this.sectionStartTime && this.isActive ? 
      now - this.sectionStartTime : 0;
    
    return {
      sessionTime,
      activeTime,
      pagesRead,
      sectionsCompleted,
      textSelections: this.textSelections.length,
      pageChanges: this.pageChanges.length,
      forwardMoves,
      backwardMoves,
      jumpMoves,
      linearReadingPercentage: totalMoves > 0 ? Math.round((forwardMoves / totalMoves) * 100) : 0,
      progressPercentage: this.config.totalPages > 0 ? (pagesRead / this.config.totalPages) * 100 : 0,
      wordsRead: totalWordsRead,
      readingSpeed: Math.max(0, Math.min(readingSpeed, 1000)),
      currentSectionTime,
      sections: this.sectionData,
      pages: this.pageData,
      isActive: this.isActive,
      totalPages: this.config.totalPages,
      currentPage: this.currentPage,
      currentSection: this.currentSection
    };
  }

  reset() {
    this.sessionStartTime = Date.now();
    this.pageStartTime = Date.now();
    this.sectionStartTime = Date.now();
    this.lastSectionUpdate = 0;
    this.textSelections = [];
    this.pageChanges = [];
    this.readingEvents = [];
    this.sectionCache.clear();
    this.initializeData();
  }

  destroy() {
    this.sectionCache.clear();
    console.log('RealTimeAnalyticsTracker destroyed');
  }
}

/**
 * PDF Analytics Core Initializer
 * This function integrates with PDF.js to provide comprehensive analytics tracking
 */
class PDFAnalyticsCore {
  constructor() {
    this.isInitialized = false;
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.eventBus = null;
    this.outlineStructure = [];
    this.currentSection = null;
    this.pageTextContent = {};
    this.analyticsTracker = null;
    
    // Analytics data structures
    this.pageData = {};
    this.sectionData = {};
    this.sessionStartTime = Date.now();
    this.currentPage = 1;
    this.totalPages = 0;
    
    // Event listeners storage for cleanup
    this.eventListeners = [];
    
    // Section detection improvements
    this.sectionDetectionCache = new Map();
    this.pageToSectionMap = new Map();
    this.sectionHeadingPatterns = [];
    this.lastDetectedSection = null;
    this.sectionDetectionConfidence = 0;
  }

  async initializePDFAnalytics(options = {}) {
    try {
      console.log('Initializing PDF Analytics...');
      
      this.options = {
        documentId: options.documentId || 'default',
        onAnalyticsUpdate: options.onAnalyticsUpdate || (() => {}),
        enableTextExtraction: options.enableTextExtraction !== false,
        autoSave: options.autoSave !== false,
        trackingSensitivity: options.trackingSensitivity || 'normal',
        sectionDetectionMode: options.sectionDetectionMode || 'hybrid' // 'outline', 'text', 'hybrid'
      };

      // Wait for PDF.js to be available
      await this.waitForPDFJS();
      
      // Get references to PDF.js components
      this.setupPDFJSReferences();
      
      // Wait for document to load
      await this.waitForDocumentLoad();
      
      // Extract document structure
      await this.extractDocumentStructure();
      
      // Build section detection helpers
      this.buildSectionDetectionHelpers();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize analytics tracker with extracted data
      this.initializeAnalyticsTracker();
      
      // Setup auto-save
      if (this.options.autoSave) {
        this.setupAutoSave();
      }
      
      this.isInitialized = true;
      console.log('PDF Analytics initialized successfully');
      
      return {
        success: true,
        documentId: this.options.documentId,
        totalPages: this.totalPages,
        sectionsFound: this.outlineStructure.length
      };
      
    } catch (error) {
      console.error('Failed to initialize PDF Analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async waitForPDFJS() {
    return new Promise((resolve, reject) => {
      const maxAttempts = 100;
      let attempts = 0;
      
      const checkPDFJS = () => {
        attempts++;
        
        if (window.PDFViewerApplication && window.PDFViewerApplication.initialized) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error('PDF.js not available after waiting'));
        } else {
          setTimeout(checkPDFJS, 100);
        }
      };
      
      checkPDFJS();
    });
  }

  setupPDFJSReferences() {
    const app = window.PDFViewerApplication;
    
    if (!app) {
      throw new Error('PDFViewerApplication not found');
    }
    
    this.pdfViewer = app.pdfViewer;
    this.eventBus = app.eventBus;
    this.pdfDocument = app.pdfDocument;
    
    if (!this.pdfViewer || !this.eventBus) {
      throw new Error('Required PDF.js components not available');
    }
    
    console.log('PDF.js references established');
  }

  async waitForDocumentLoad() {
    return new Promise((resolve, reject) => {
      if (this.pdfDocument && this.pdfDocument.numPages > 0) {
        this.totalPages = this.pdfDocument.numPages;
        this.currentPage = this.pdfViewer.currentPageNumber;
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Document load timeout'));
      }, 30000);
      
      const checkDocument = () => {
        const app = window.PDFViewerApplication;
        if (app.pdfDocument && app.pdfDocument.numPages > 0) {
          clearTimeout(timeout);
          this.pdfDocument = app.pdfDocument;
          this.totalPages = this.pdfDocument.numPages;
          this.currentPage = this.pdfViewer.currentPageNumber;
          console.log(`Document loaded: ${this.totalPages} pages`);
          resolve();
        } else {
          setTimeout(checkDocument, 100);
        }
      };
      
      checkDocument();
    });
  }

  async extractDocumentStructure() {
    try {
      console.log('Extracting document structure...');
      
      // Get outline from PDF document
      const outline = await this.pdfDocument.getOutline();
      
      if (outline && outline.length > 0) {
        this.outlineStructure = await this.parseOutlineWithAccuracy(outline);
        console.log(`Found ${this.outlineStructure.length} outline items`);
      } else {
        // Create default sections based on page ranges
        this.outlineStructure = this.createDefaultSections();
        console.log('No outline found, created default sections');
      }
      
      // Calculate end pages for sections
      this.calculateSectionEndPages();
      
      // Extract text content if enabled
      if (this.options.enableTextExtraction) {
        await this.extractTextContent();
      }
      
    } catch (error) {
      console.error('Error extracting document structure:', error);
      this.outlineStructure = this.createDefaultSections();
    }
  }

  async parseOutlineWithAccuracy(outline, level = 1) {
    const sections = [];
    
    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      
      try {
        // Get accurate page number from destination
        let pageNumber = 1;
        
        if (item.dest) {
          if (typeof item.dest === 'string') {
            // Named destination
            const dest = await this.pdfDocument.getDestination(item.dest);
            if (dest) {
              pageNumber = await this.getPageNumberFromDest(dest);
            }
          } else if (Array.isArray(item.dest)) {
            // Direct destination
            pageNumber = await this.getPageNumberFromDest(item.dest);
          }
        }
        
        const section = {
          title: item.title || `Section ${sections.length + 1}`,
          page: Math.max(1, Math.min(pageNumber, this.totalPages)),
          level: level,
          id: `section_${level}_${i}_${Date.now()}`,
          children: [],
          endPage: null // Will be calculated later
        };
        
        // Parse children recursively
        if (item.items && item.items.length > 0) {
          section.children = await this.parseOutlineWithAccuracy(item.items, level + 1);
        }
        
        sections.push(section);
        
      } catch (error) {
        console.warn('Error parsing outline item:', error);
        sections.push({
          title: item.title || `Section ${sections.length + 1}`,
          page: 1,
          level: level,
          id: `section_${level}_${i}_${Date.now()}`,
          children: [],
          endPage: null
        });
      }
    }
    
    return sections;
  }

  async getPageNumberFromDest(dest) {
    try {
      if (!dest || !Array.isArray(dest) || dest.length === 0) return 1;
      
      const ref = dest[0];
      if (!ref) return 1;
      
      // Get page index from reference
      const pageIndex = await this.pdfDocument.getPageIndex(ref);
      return pageIndex + 1; // Convert 0-based to 1-based
      
    } catch (error) {
      console.warn('Error resolving page number:', error);
      return 1;
    }
  }

  calculateSectionEndPages() {
    // Flatten outline structure for easier processing
    const flatSections = this.flattenOutline(this.outlineStructure);
    
    // Sort by page number
    flatSections.sort((a, b) => a.page - b.page);
    
    // Calculate end pages
    for (let i = 0; i < flatSections.length; i++) {
      if (i < flatSections.length - 1) {
        flatSections[i].endPage = flatSections[i + 1].page - 1;
      } else {
        flatSections[i].endPage = this.totalPages;
      }
      
      // Ensure endPage is at least the start page
      flatSections[i].endPage = Math.max(flatSections[i].endPage, flatSections[i].page);
    }
    
    // Update the original structure
    this.updateOutlineEndPages(this.outlineStructure, flatSections);
  }

  flattenOutline(outline, result = []) {
    for (const section of outline) {
      result.push({
        ...section,
        children: undefined
      });
      
      if (section.children && section.children.length > 0) {
        this.flattenOutline(section.children, result);
      }
    }
    return result;
  }

  updateOutlineEndPages(outline, flatSections) {
    for (const section of outline) {
      const flat = flatSections.find(f => f.id === section.id);
      if (flat) {
        section.endPage = flat.endPage;
      }
      
      if (section.children && section.children.length > 0) {
        this.updateOutlineEndPages(section.children, flatSections);
      }
    }
  }

  createDefaultSections() {
    const sections = [];
    const pagesPerSection = Math.max(1, Math.ceil(this.totalPages / 10));
    
    for (let i = 0; i < this.totalPages; i += pagesPerSection) {
      const startPage = i + 1;
      const endPage = Math.min(i + pagesPerSection, this.totalPages);
      
      sections.push({
        title: `Section ${Math.ceil(startPage / pagesPerSection)}`,
        page: startPage,
        endPage: endPage,
        level: 1,
        id: `default_section_${sections.length}`,
        children: []
      });
    }
    
    return sections;
  }

  buildSectionDetectionHelpers() {
    // Build page to section mapping
    const flatSections = this.flattenOutline(this.outlineStructure);
    
    for (const section of flatSections) {
      for (let page = section.page; page <= (section.endPage || section.page); page++) {
        if (!this.pageToSectionMap.has(page)) {
          this.pageToSectionMap.set(page, []);
        }
        this.pageToSectionMap.get(page).push(section);
      }
    }
    
    // Build section heading patterns from titles
    this.sectionHeadingPatterns = flatSections.map(section => ({
      section: section,
      pattern: this.createHeadingPattern(section.title),
      words: section.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    }));
    
    console.log(`Built section detection helpers: ${this.pageToSectionMap.size} page mappings`);
  }

  createHeadingPattern(title) {
    // Escape special regex characters
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create flexible pattern
    return new RegExp(
      escaped.split(/\s+/).join('\\s*'),
      'i'
    );
  }

  async extractTextContent() {
    console.log('Extracting text content...');
    
    try {
      // Extract text from more pages for better section detection
      const pagesToExtract = Math.min(10, this.totalPages);
      
      for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
        try {
          const page = await this.pdfDocument.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Store structured text content
          this.pageTextContent[pageNum] = {
            raw: textContent.items.map(item => item.str).join(' ').trim(),
            items: textContent.items,
            structured: this.structureTextContent(textContent.items)
          };
          
        } catch (error) {
          console.warn(`Error extracting text from page ${pageNum}:`, error);
        }
      }
      
      console.log(`Extracted text from ${Object.keys(this.pageTextContent).length} pages`);
      
    } catch (error) {
      console.error('Error extracting text content:', error);
    }
  }

  structureTextContent(items) {
    const structured = {
      headings: [],
      paragraphs: [],
      allText: []
    };
    
    let currentY = null;
    let currentLine = [];
    
    for (const item of items) {
      if (!item.str || item.str.trim().length === 0) continue;
      
      // Group items by Y position (same line)
      if (currentY === null || Math.abs(item.transform[5] - currentY) < 2) {
        currentLine.push(item);
        currentY = item.transform[5];
      } else {
        // Process completed line
        if (currentLine.length > 0) {
          const lineText = currentLine.map(i => i.str).join(' ').trim();
          const lineHeight = Math.max(...currentLine.map(i => i.height || 0));
          
          structured.allText.push({
            text: lineText,
            height: lineHeight,
            y: currentY,
            items: currentLine
          });
          
          // Detect headings based on font size
          if (lineHeight > 12 && lineText.length < 100) {
            structured.headings.push({
              text: lineText,
              height: lineHeight,
              y: currentY
            });
          }
        }
        
        currentLine = [item];
        currentY = item.transform[5];
      }
    }
    
    // Process last line
    if (currentLine.length > 0) {
      const lineText = currentLine.map(i => i.str).join(' ').trim();
      const lineHeight = Math.max(...currentLine.map(i => i.height || 0));
      
      structured.allText.push({
        text: lineText,
        height: lineHeight,
        y: currentY,
        items: currentLine
      });
      
      if (lineHeight > 12 && lineText.length < 100) {
        structured.headings.push({
          text: lineText,
          height: lineHeight,
          y: currentY
        });
      }
    }
    
    return structured;
  }

  setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Page change events
    this.addEventListener('pagechanging', (evt) => {
      this.handlePageChange(evt.pageNumber);
    });
    
    // Document events
    this.addEventListener('documentloaded', () => {
      console.log('Document fully loaded');
    });
    
    // Text selection tracking
    this.setupTextSelectionTracking();
    
    // Viewport tracking for better section detection
    this.setupViewportTracking();
    
    console.log('Event listeners configured');
  }

  setupTextSelectionTracking() {
    let selectionTimeout;
    
    const handleTextSelection = () => {
      clearTimeout(selectionTimeout);
      
      selectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 5) {
          const selectedText = selection.toString().trim();
          
          // Get the page number from the selection
          const range = selection.getRangeAt(0);
          const container = range.commonAncestorContainer;
          const pageElement = this.findPageElement(container);
          const pageNumber = pageElement ? this.getPageNumberFromElement(pageElement) : this.currentPage;
          
          // Detect section more accurately
          const detectedSection = this.detectSectionFromContent(selectedText, pageNumber);
          
          if (detectedSection && detectedSection.confidence > 0.5) {
            this.updateCurrentSection(detectedSection.section, 'text_selection');
          }
          
          // Record selection
          if (this.analyticsTracker) {
            this.analyticsTracker.recordTextSelection({
              text: selectedText,
              page: pageNumber,
              section: this.currentSection ? this.currentSection.title : 'Unknown',
              timestamp: Date.now(),
              length: selectedText.length
            });
          }
          
          // Add activity
          const preview = selectedText.length > 50 ? 
            selectedText.substring(0, 50) + '...' : selectedText;
          this.addActivity(`Selected text: "${preview}"`);
        }
      }, 300);
    };
    
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('selectionchange', handleTextSelection);
    
    this.eventListeners.push(
      { element: document, eventName: 'mouseup', handler: handleTextSelection },
      { element: document, eventName: 'selectionchange', handler: handleTextSelection }
    );
  }

  setupViewportTracking() {
    let viewportTimeout;
    
    const handleViewportChange = () => {
      clearTimeout(viewportTimeout);
      
      viewportTimeout = setTimeout(() => {
        this.detectSectionFromViewport();
      }, 500);
    };
    
    // Find PDF viewer container
    const viewerContainer = document.querySelector('#viewerContainer') || 
                           document.querySelector('.pdfViewer');
    
    if (viewerContainer) {
      viewerContainer.addEventListener('scroll', handleViewportChange, { passive: true });
      this.eventListeners.push({
        element: viewerContainer,
        eventName: 'scroll',
        handler: handleViewportChange
      });
    }
    
    // Also track resize events
    window.addEventListener('resize', handleViewportChange);
    this.eventListeners.push({
      element: window,
      eventName: 'resize',
      handler: handleViewportChange
    });
  }

  findPageElement(node) {
    let current = node;
    while (current && current !== document.body) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        if (current.classList && current.classList.contains('page')) {
          return current;
        }
        if (current.getAttribute && current.getAttribute('data-page-number')) {
          return current;
        }
      }
      current = current.parentNode;
    }
    return null;
  }

  getPageNumberFromElement(pageElement) {
    if (!pageElement) return this.currentPage;
    
    // Try different methods to get page number
    const dataPageNum = pageElement.getAttribute('data-page-number');
    if (dataPageNum) return parseInt(dataPageNum, 10);
    
    const idMatch = pageElement.id && pageElement.id.match(/pageContainer(\d+)/);
    if (idMatch) return parseInt(idMatch[1], 10);
    
    // Look for page number in aria-label
    const ariaLabel = pageElement.getAttribute('aria-label');
    if (ariaLabel) {
      const match = ariaLabel.match(/Page (\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    
    return this.currentPage;
  }

  detectSectionFromContent(text, pageNumber) {
    if (!text || text.length < 2) return null;
    
    const cleanText = text.toLowerCase().trim();
    let bestMatch = null;
    let highestConfidence = 0;
    
    // Get possible sections for this page
    const possibleSections = this.pageToSectionMap.get(pageNumber) || [];
    
    // First, check against section titles
    for (const patternInfo of this.sectionHeadingPatterns) {
      const section = patternInfo.section;
      
      // Skip if section is not on this page
      if (pageNumber < section.page || pageNumber > (section.endPage || section.page)) {
        continue;
      }
      
      let confidence = 0;
      
      // Check pattern match
      if (patternInfo.pattern.test(cleanText)) {
        confidence = 0.9;
      } else {
        // Check word matching
        const textWords = cleanText.split(/\s+/).filter(w => w.length > 2);
        const matchingWords = patternInfo.words.filter(w => textWords.includes(w));
        
        if (matchingWords.length > 0) {
          confidence = matchingWords.length / patternInfo.words.length * 0.7;
        }
      }
      
      // Boost confidence if section is in possible sections
      if (possibleSections.includes(section)) {
        confidence *= 1.2;
      }
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = section;
      }
    }
    
    // If no good match, try to detect from page structure
    if (highestConfidence < 0.3 && this.pageTextContent[pageNumber]) {
      const pageContent = this.pageTextContent[pageNumber];
      if (pageContent.structured && pageContent.structured.headings.length > 0) {
        // Check if selected text matches any heading
        for (const heading of pageContent.structured.headings) {
          const similarity = this.calculateTextSimilarity(cleanText, heading.text.toLowerCase());
          if (similarity > 0.6) {
            // Find the section for this page
            const pageSection = possibleSections[0] || this.findSectionForPage(pageNumber);
            if (pageSection) {
              return {
                section: pageSection,
                confidence: similarity * 0.8
              };
            }
          }
        }
      }
    }
    
    return bestMatch ? { section: bestMatch, confidence: highestConfidence } : null;
  }

  detectSectionFromViewport() {
    try {
      // Get visible pages
      const visiblePages = this.getVisiblePages();
      if (visiblePages.length === 0) return;
      
      // Primary page is the one with most visibility
      const primaryPage = visiblePages.reduce((a, b) => 
        a.visibilityRatio > b.visibilityRatio ? a : b
      );
      
      // Get sections for the primary visible page
      const sections = this.pageToSectionMap.get(primaryPage.number) || [];
      
      if (sections.length > 0) {
        // If page has multiple sections, try to detect from visible content
        if (sections.length > 1 && this.pageTextContent[primaryPage.number]) {
          const visibleText = this.getVisibleTextOnPage(primaryPage.element);
          if (visibleText) {
            const detected = this.detectSectionFromContent(visibleText, primaryPage.number);
            if (detected && detected.confidence > 0.5) {
              this.updateCurrentSection(detected.section, 'viewport_detection');
              return;
            }
          }
        }
        
        // Use the first section for the page
        this.updateCurrentSection(sections[0], 'page_based');
      }
      
    } catch (error) {
      console.warn('Error in viewport section detection:', error);
    }
  }

  getVisiblePages() {
    const pages = [];
    const pageElements = document.querySelectorAll('.page, [data-page-number]');
    const viewportHeight = window.innerHeight;
    
    for (const pageEl of pageElements) {
      const rect = pageEl.getBoundingClientRect();
      
      // Check if page is in viewport
      if (rect.bottom > 0 && rect.top < viewportHeight) {
        const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
        const visibilityRatio = visibleHeight / rect.height;
        
        if (visibilityRatio > 0.1) { // At least 10% visible
          pages.push({
            element: pageEl,
            number: this.getPageNumberFromElement(pageEl),
            visibilityRatio: visibilityRatio,
            rect: rect
          });
        }
      }
    }
    
    return pages;
  }

  getVisibleTextOnPage(pageElement) {
    if (!pageElement) return '';
    
    const textElements = pageElement.querySelectorAll('.textLayer span, .textLayer div');
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + window.innerHeight;
    
    let visibleText = '';
    
    for (const element of textElements) {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + viewportTop;
      const elementBottom = rect.bottom + viewportTop;
      
      // Check if element is in viewport
      if (elementBottom > viewportTop && elementTop < viewportBottom) {
        visibleText += element.textContent + ' ';
      }
    }
    
    return visibleText.trim();
  }

  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Normalize texts
    const norm1 = text1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const norm2 = text2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    
    // Calculate Jaccard similarity
    const set1 = new Set(norm1);
    const set2 = new Set(norm2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  handlePageChange(newPage) {
    if (newPage !== this.currentPage) {
      const oldPage = this.currentPage;
      console.log(`Page changed: ${oldPage} -> ${newPage}`);
      
      // Update current page
      this.currentPage = newPage;
      
      // Record page change in tracker
      if (this.analyticsTracker) {
        this.analyticsTracker.recordPageChange(oldPage, newPage);
      }
      
      // Update section based on new page
      const sections = this.pageToSectionMap.get(newPage) || [];
      if (sections.length > 0) {
        // If only one section on page, use it
        if (sections.length === 1) {
          this.updateCurrentSection(sections[0], 'page_change');
        } else {
          // Multiple sections on page, will detect from content
          setTimeout(() => this.detectSectionFromViewport(), 100);
        }
      }
      
      // Add activity
      this.addActivity(`Moved to page ${newPage}`);
      
      // Extract text content for new page if needed
      this.extractPageTextIfNeeded(newPage);
    }
  }

  updateCurrentSection(newSection, detectionMethod = 'unknown') {
    if (!newSection || (this.currentSection && this.currentSection.id === newSection.id)) {
      return;
    }
    
    const previousSection = this.currentSection;
    this.currentSection = newSection;
    this.lastDetectedSection = newSection;
    this.sectionDetectionConfidence = detectionMethod === 'text_selection' ? 0.9 : 0.7;
    
    if (this.analyticsTracker) {
      this.analyticsTracker.recordSectionChange(previousSection, newSection);
    }
    
    // Add activity with detection method
    this.addActivity(`Entered section: ${newSection.title}`);
    
    console.log(`Section updated: ${newSection.title} (${detectionMethod})`);
  }

  findSectionForPage(pageNumber) {
    const sections = this.pageToSectionMap.get(pageNumber) || [];
    return sections.length > 0 ? sections[0] : null;
  }

  async extractPageTextIfNeeded(pageNumber) {
    if (!this.options.enableTextExtraction || this.pageTextContent[pageNumber]) {
      return;
    }
    
    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      
      this.pageTextContent[pageNumber] = {
        raw: textContent.items.map(item => item.str).join(' ').trim(),
        items: textContent.items,
        structured: this.structureTextContent(textContent.items)
      };
      
      console.log(`Extracted text for page ${pageNumber}`);
      
    } catch (error) {
      console.warn(`Error extracting text from page ${pageNumber}:`, error);
    }
  }

  initializeAnalyticsTracker() {
    const trackerConfig = {
      currentDocumentId: this.options.documentId,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      outlineStructure: this.outlineStructure,
      currentSection: this.currentSection,
      averageWordsPerPage: this.calculateAverageWordsPerPage()
    };
    
    console.log('Analytics tracker configuration:', trackerConfig);
    
    // Initialize the real-time analytics tracker
    this.analyticsTracker = new RealTimeAnalyticsTracker(trackerConfig);
    
    // Create analytics UI
    this.createAnalyticsUI();
    
    // Initialize activity log
    this.activityLog = [];
    this.addActivity('Session started');
  }

  calculateAverageWordsPerPage() {
    const textPages = Object.values(this.pageTextContent);
    if (textPages.length === 0) return 275;
    
    const totalWords = textPages.reduce((sum, page) => {
      const words = page.raw.split(/\s+/).filter(word => word.length > 0);
      return sum + words.length;
    }, 0);
    
    return Math.round(totalWords / textPages.length);
  }

  setupAutoSave() {
    setInterval(() => {
      this.saveAnalyticsData();
    }, 30000); // Save every 30 seconds
  }


  // Add to setupEventListeners method in PDFAnalyticsCore class
setupEventListeners() {
  console.log('Setting up event listeners...');
  // Page change events
  this.addEventListener('pagechanging', (evt) => {
    this.handlePageChange(evt.pageNumber);
  });
  // Document events
  this.addEventListener('documentloaded', () => {
    console.log('Document fully loaded');
  });
  // Text selection tracking
  this.setupTextSelectionTracking();
  // Viewport tracking for better section detection
  this.setupViewportTracking();
  // Add hover detection for better section identification
  this.setupHoverDetection();
  console.log('Event listeners configured');
}

// Add this new method to PDFAnalyticsCore class
setupHoverDetection() {
  let hoverThrottle;
  const handleHover = (event) => {
    // Skip if too frequent
    if (hoverThrottle) return;
    
    hoverThrottle = setTimeout(() => {
      hoverThrottle = null;
      
      // Find text element being hovered
      const target = event.target;
      if (!target || !target.textContent || target.textContent.trim().length < 3) return;
      
      // Get page element
      const pageElement = this.findPageElement(target);
      if (!pageElement) return;
      
      // Get page number
      const pageNumber = this.getPageNumberFromElement(pageElement);
      if (!pageNumber) return;
      
      // Extract text from the hovered element and surrounding elements
      const hoverContext = this.getHoverContextText(target, pageElement);
      if (!hoverContext) return;
      
      // Try to detect section from hover context
      const detectedSection = this.detectSectionFromContent(hoverContext, pageNumber);
      if (detectedSection && detectedSection.confidence > 0.4) {
        this.updateCurrentSection(detectedSection.section, 'hover_detection');
      } else {
        // If no good match, extract more text around the hover area
        this.extractSectionFromHoverPosition(target, pageNumber);
      }
    }, 300); // Throttle hover events
  };
  
  // Add event listener to document
  document.addEventListener('mousemove', handleHover, { passive: true });
  this.eventListeners.push({
    element: document,
    eventName: 'mousemove',
    handler: handleHover
  });
  
  console.log('Hover detection set up');
}

// Add helper methods for hover detection
getHoverContextText(element, pageElement) {
  // Get the text from the hovered element
  let hoverText = element.textContent.trim();
  
  // If text is too short, get siblings text as well
  if (hoverText.length < 20) {
    // Get parent and siblings
    const parent = element.parentNode;
    if (parent) {
      const siblings = Array.from(parent.childNodes);
      // Combine text from siblings
      hoverText = siblings
        .filter(node => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE)
        .map(node => node.textContent || '')
        .join(' ')
        .trim();
    }
  }
  
  // If still too short, get surrounding text
  if (hoverText.length < 30) {
    // Get nearby text elements
    const textElements = pageElement.querySelectorAll('.textLayer span, .textLayer div');
    if (textElements.length > 0) {
      // Find position of current element
      const elementRect = element.getBoundingClientRect();
      const nearbyElements = Array.from(textElements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          // Elements within reasonable proximity
          return Math.abs(rect.top - elementRect.top) < 50;
        })
        .slice(0, 5); // Limit to 5 nearby elements
      
      if (nearbyElements.length > 0) {
        hoverText = nearbyElements
          .map(el => el.textContent || '')
          .join(' ')
          .trim();
      }
    }
  }
  
  return hoverText;
}

extractSectionFromHoverPosition(element, pageNumber) {
  // Already have text content for this page
  if (this.pageTextContent[pageNumber]) {
    const textContent = this.pageTextContent[pageNumber];
    
    // Get position of hovered element
    const elementRect = element.getBoundingClientRect();
    const elementY = elementRect.top;
    
    // Find headings above the hover position
    if (textContent.structured && textContent.structured.headings.length > 0) {
      // Sort headings by position (top to bottom)
      const sortedHeadings = [...textContent.structured.headings]
        .sort((a, b) => a.y - b.y);
      
      // Find last heading before hover position
      let closestHeading = null;
      let minDistance = Infinity;
      
      for (const heading of sortedHeadings) {
        const headingElement = document.evaluate(
          `//*[contains(text(), "${heading.text.substring(0, 20)}")]`,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        
        if (headingElement) {
          const headingRect = headingElement.getBoundingClientRect();
          const distance = Math.abs(elementY - headingRect.top);
          
          // Only consider headings above or very close to hover position
          if (headingRect.top <= elementY + 30 && distance < minDistance) {
            minDistance = distance;
            closestHeading = heading;
          }
        }
      }
      
      if (closestHeading) {
        // Find or create section for this heading
        const sections = this.pageToSectionMap.get(pageNumber) || [];
        let matchedSection = null;
        
        // Try to match with existing sections
        for (const section of sections) {
          const similarity = this.calculateTextSimilarity(
            closestHeading.text.toLowerCase(),
            section.title.toLowerCase()
          );
          
          if (similarity > 0.6) {
            matchedSection = section;
            break;
          }
        }
        
        // If matched section found, update current section
        if (matchedSection) {
          this.updateCurrentSection(matchedSection, 'heading_match');
          return;
        }
        
        // If no match but we're confident this is a heading, create a dynamic section
        if (closestHeading.height > 14 || closestHeading.text.length < 60) {
          // Check if we already have a dynamic section for this heading
          const dynamicSectionId = `dynamic_section_${pageNumber}_${closestHeading.text.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
          
          // Find in outline structure or create new
          let dynamicSection = this.outlineStructure.find(s => s.id === dynamicSectionId);
          
          if (!dynamicSection) {
            dynamicSection = {
              id: dynamicSectionId,
              title: closestHeading.text,
              page: pageNumber,
              endPage: pageNumber,
              level: 2,
              isDynamic: true
            };
            
            // Add to outline structure
            this.outlineStructure.push(dynamicSection);
            
            // Update section mapping
            if (!this.pageToSectionMap.has(pageNumber)) {
              this.pageToSectionMap.set(pageNumber, []);
            }
            this.pageToSectionMap.get(pageNumber).push(dynamicSection);
            
            // Initialize in analytics tracker
            if (this.analyticsTracker) {
              this.analyticsTracker.sectionData[dynamicSection.id] = {
                id: dynamicSection.id,
                title: dynamicSection.title,
                page: dynamicSection.page,
                endPage: dynamicSection.endPage,
                timeSpent: 0,
                visits: 0,
                completed: false,
                wordsRead: 0,
                startTime: null,
                endTime: null,
                pagesInSection: [pageNumber]
              };
            }
            
            console.log(`Created dynamic section: ${dynamicSection.title}`);
          }
          
          this.updateCurrentSection(dynamicSection, 'dynamic_detection');
        }
      }
    }
  } else {
    // We don't have text content yet, extract it
    this.extractPageTextIfNeeded(pageNumber).then(() => {
      // Try detection again after extraction
      setTimeout(() => {
        this.extractSectionFromHoverPosition(element, pageNumber);
      }, 100);
    });
  }
}

// Improve detectSectionFromViewport method
detectSectionFromViewport() {
  try {
    // Get visible pages
    const visiblePages = this.getVisiblePages();
    if (visiblePages.length === 0) return;
    
    // Primary page is the one with most visibility
    const primaryPage = visiblePages.reduce((a, b) =>
      a.visibilityRatio > b.visibilityRatio ? a : b
    );
    
    // Get sections for the primary visible page
    const sections = this.pageToSectionMap.get(primaryPage.number) || [];
    
    if (sections.length > 0) {
      // If page has multiple sections, try to detect from visible content
      if (sections.length > 1) {
        const visibleText = this.getVisibleTextOnPage(primaryPage.element);
        if (visibleText) {
          // Extract all visible headings
          const visibleHeadings = this.extractHeadingsFromVisibleArea(primaryPage.element);
          
          if (visibleHeadings.length > 0) {
            // Sort headings by position (top to bottom)
            visibleHeadings.sort((a, b) => a.top - b.top);
            
            // Find the first visible heading
            const topHeading = visibleHeadings[0];
            
            // Find matching section
            for (const section of sections) {
              const similarity = this.calculateTextSimilarity(
                topHeading.text.toLowerCase(),
                section.title.toLowerCase()
              );
              
              if (similarity > 0.6) {
                this.updateCurrentSection(section, 'visible_heading');
                return;
              }
            }
          }
          
          // If no heading match, try content match
          const detected = this.detectSectionFromContent(visibleText, primaryPage.number);
          if (detected && detected.confidence > 0.5) {
            this.updateCurrentSection(detected.section, 'viewport_detection');
            return;
          }
        }
      }
      
      // Use the first section for the page if no better detection
      this.updateCurrentSection(sections[0], 'page_based');
    }
  } catch (error) {
    console.warn('Error in viewport section detection:', error);
  }
}

// Add helper method to extract headings from visible area
extractHeadingsFromVisibleArea(pageElement) {
  const headings = [];
  const viewportTop = 0;
  const viewportBottom = window.innerHeight;
  
  // Find all text elements
  const textElements = pageElement.querySelectorAll('.textLayer span, .textLayer div');
  
  for (const element of textElements) {
    // Skip empty elements
    if (!element.textContent || element.textContent.trim().length < 3) continue;
    
    const rect = element.getBoundingClientRect();
    
    // Check if element is in viewport
    if (rect.bottom > viewportTop && rect.top < viewportBottom) {
      // Check if it might be a heading (larger font, bold, etc.)
      const style = window.getComputedStyle(element);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = style.fontWeight;
      
      const isLargeFont = fontSize > 14;
      const isBold = parseInt(fontWeight, 10) >= 600;
      const isShortText = element.textContent.trim().length < 80;
      
      // Scoring system for headings
      let headingScore = 0;
      if (isLargeFont) headingScore += 2;
      if (isBold) headingScore += 1;
      if (isShortText) headingScore += 1;
      
      // If likely a heading, add to list
      if (headingScore >= 2) {
        headings.push({
          text: element.textContent.trim(),
          element: element,
          top: rect.top,
          fontSize: fontSize,
          score: headingScore
        });
      }
    }
  }
  
  return headings;
}

// Improve the getPageNumberFromElement method for better accuracy
getPageNumberFromElement(pageElement) {
  if (!pageElement) return this.currentPage;
  
  // Try different methods to get page number
  // 1. Direct data attribute
  const dataPageNum = pageElement.getAttribute('data-page-number');
  if (dataPageNum) return parseInt(dataPageNum, 10);
  
  // 2. ID-based extraction
  const idMatch = pageElement.id && pageElement.id.match(/pageContainer(\d+)/);
  if (idMatch) return parseInt(idMatch[1], 10);
  
  // 3. Page number from aria-label
  const ariaLabel = pageElement.getAttribute('aria-label');
  if (ariaLabel) {
    const match = ariaLabel.match(/Page (\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  
  // 4. Look for page number in any child elements
  const pageNumberElements = pageElement.querySelectorAll('.pageNumber, .page-number');
  for (const element of pageNumberElements) {
    const text = element.textContent.trim();
    const match = text.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  
  // 5. Check if the element itself has a page number as text
  const elementText = pageElement.textContent;
  if (elementText) {
    const match = elementText.match(/Page (\d+)/i);
    if (match) return parseInt(match[1], 10);
  }
  
  return this.currentPage;
}

  saveAnalyticsData() {
    try {
      const data = this.getAnalyticsData();
      const key = `pdf_analytics_${this.options.documentId}`;
      localStorage.setItem(key, JSON.stringify(data));
      console.log('Analytics data saved');
    } catch (error) {
      console.error('Error saving analytics data:', error);
    }
  }

  getAnalyticsData() {
    if (this.analyticsTracker) {
      return this.analyticsTracker.getAnalytics();
    }
    
    return {
      documentId: this.options.documentId,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      sectionsFound: this.outlineStructure.length,
      isInitialized: this.isInitialized,
      timestamp: Date.now()
    };
  }

  exportAnalytics() {
    const data = this.getAnalyticsData();
    const enrichedData = {
      ...data,
      documentInfo: {
        id: this.options.documentId,
        totalPages: this.totalPages,
        sections: this.outlineStructure.map(s => ({
          title: s.title,
          page: s.page,
          endPage: s.endPage,
          completed: data.sections && data.sections[s.id] ? data.sections[s.id].completed : false
        }))
      },
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(enrichedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf_analytics_${this.options.documentId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  addEventListener(eventName, handler) {
    if (this.eventBus) {
      this.eventBus._on(eventName, handler);
      this.eventListeners.push({ eventName, handler, eventBus: true });
    }
  }

  createAnalyticsUI() {
    // Remove existing UI if any
    if (this.analyticsUI) {
      this.analyticsUI.remove();
    }

    this.analyticsUI = document.createElement('div');
    this.analyticsUI.id = 'pdf-analytics-ui';
    this.analyticsUI.innerHTML = `
      <style>
        #pdf-analytics-ui {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 320px;
          max-height: 80vh;
          background: #ffffff;
          border: 1px solid #e1e5e9;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          z-index: 10000;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        
        #pdf-analytics-ui.minimized {
          height: 60px;
          overflow: hidden;
        }
        
        .analytics-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;
        }
        
        .analytics-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
        }
        
        .analytics-header .controls {
          display: flex;
          gap: 8px;
        }
        
        .analytics-header button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          transition: background 0.2s;
        }
        
        .analytics-header button:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .analytics-content {
          padding: 16px;
          max-height: calc(80vh - 60px);
          overflow-y: auto;
        }
        
        .analytics-section {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .analytics-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        
        .section-title {
          font-weight: 600;
          color: #2c3e50;
          margin-bottom: 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        
        .stat-item {
          background: #f8f9fa;
          padding: 8px;
          border-radius: 6px;
          text-align: center;
        }
        
        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #2c3e50;
          display: block;
        }
        
        .stat-label {
          font-size: 10px;
          color: #6c757d;
          margin-top: 2px;
        }
        
        .progress-bar {
          background: #e9ecef;
          border-radius: 10px;
          height: 8px;
          overflow: hidden;
          margin: 4px 0;
        }
        
        .progress-fill {
          background: linear-gradient(90deg, #28a745, #20c997);
          height: 100%;
          transition: width 0.3s ease;
        }
        
        .section-list {
          max-height: 120px;
          overflow-y: auto;
        }
        
        .section-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          margin: 2px 0;
          border-radius: 4px;
          font-size: 11px;
        }
        
        .section-item.completed {
          background: #d4edda;
          color: #155724;
        }
        
        .section-item.current {
          background: #cce5ff;
          color: #004085;
          font-weight: 600;
        }
        
        .section-item.in-progress {
          background: #fff3cd;
          color: #856404;
        }
        
        .section-item.unread {
          background: #f8f9fa;
          color: #6c757d;
        }
        
        .live-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: #28a745;
          border-radius: 50%;
          margin-right: 6px;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        .time-display {
          font-family: 'Courier New', monospace;
          font-weight: 600;
          color: #495057;
        }
        
        .activity-feed {
          max-height: 100px;
          overflow-y: auto;
          font-size: 11px;
        }
        
        .activity-item {
          padding: 3px 0;
          color: #6c757d;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .activity-time {
          color: #28a745;
          font-weight: 600;
        }
        
        .confidence-indicator {
          display: inline-block;
          width: 40px;
          height: 4px;
          background: #e9ecef;
          border-radius: 2px;
          margin-left: 8px;
          position: relative;
          top: -2px;
        }
        
        .confidence-fill {
          height: 100%;
          background: #28a745;
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 2px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 2px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      </style>
      
      <div class="analytics-header" onclick="window.pdfAnalyticsCore.toggleUI()">
        <h3>
          <span class="live-indicator"></span>
          PDF Analytics
        </h3>
        <div class="controls">
          <button onclick="event.stopPropagation(); window.pdfAnalyticsCore.exportAnalytics()">Export</button>
          <button onclick="event.stopPropagation(); window.pdfAnalyticsCore.resetAnalytics()">Reset</button>
        </div>
      </div>
      
      <div class="analytics-content">
        <!-- Session Overview -->
        <div class="analytics-section">
          <div class="section-title">📊 Session Overview</div>
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-value time-display" id="session-time">00:00:00</span>
              <div class="stat-label">Session Time</div>
            </div>
            <div class="stat-item">
              <span class="stat-value time-display" id="active-time">00:00:00</span>
              <div class="stat-label">Active Time</div>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="pages-read">0</span>
              <div class="stat-label">Pages Read</div>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="reading-speed">0</span>
              <div class="stat-label">WPM</div>
            </div>
          </div>
        </div>
        
        <!-- Reading Progress -->
        <div class="analytics-section">
          <div class="section-title">📖 Reading Progress</div>
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
              <span>Progress</span>
              <span id="progress-percentage">0%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
            </div>
          </div>
          <div style="font-size: 11px; color: #6c757d;">
            Page <span id="current-page">1</span> of <span id="total-pages">1</span> • 
            <span id="words-read">0</span> words read
          </div>
        </div>
        
        <!-- Current Section -->
        <div class="analytics-section">
          <div class="section-title">📑 Current Section</div>
          <div id="current-section-info" style="padding: 8px; background: #e7f3ff; border-radius: 6px; font-size: 11px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong id="current-section-title">No section detected</strong>
              <div class="confidence-indicator" title="Detection confidence">
                <div class="confidence-fill" id="confidence-fill" style="width: 0%"></div>
              </div>
            </div>
            <span style="color: #6c757d;">
              Time in section: <span id="section-time" class="time-display">00:00</span>
            </span>
          </div>
        </div>
        
        <!-- Sections Covered -->
        <div class="analytics-section">
          <div class="section-title">
            📚 Sections Covered (<span id="sections-completed">0</span>/<span id="sections-total">0</span>)
          </div>
          <div class="section-list scrollbar-thin" id="sections-list">
            <!-- Sections will be populated here -->
          </div>
        </div>
        
        <!-- Text Interactions -->
        <div class="analytics-section">
          <div class="section-title">✍️ Text Interactions</div>
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-value" id="text-selections">0</span>
              <div class="stat-label">Text Selections</div>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="page-changes">0</span>
              <div class="stat-label">Page Changes</div>
            </div>
          </div>
        </div>
        
        <!-- Reading Patterns -->
        <div class="analytics-section">
          <div class="section-title">🔄 Reading Patterns</div>
          <div style="font-size: 11px; line-height: 1.6;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>Forward moves:</span>
              <span id="forward-moves">0</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>Backward moves:</span>
              <span id="backward-moves">0</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>Jump moves:</span>
              <span id="jump-moves">0</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Linear reading:</span>
              <span id="linear-percentage">0%</span>
            </div>
          </div>
        </div>
        
        <!-- Activity Feed -->
        <div class="analytics-section">
          <div class="section-title">⚡ Recent Activity</div>
          <div class="activity-feed scrollbar-thin" id="activity-feed">
            <!-- Activities will be populated here -->
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.analyticsUI);
    
    // Start real-time updates
    this.startRealTimeUpdates();
    
    console.log('Analytics UI created');
  }

  toggleUI() {
    if (this.analyticsUI) {
      this.analyticsUI.classList.toggle('minimized');
    }
  }

  resetAnalytics() {
    if (confirm('Are you sure you want to reset all analytics data?')) {
      if (this.analyticsTracker) {
        this.analyticsTracker.reset();
      }
      this.activityLog = [];
      this.addActivity('Analytics reset');
      this.currentSection = null;
      this.lastDetectedSection = null;
      this.sectionDetectionConfidence = 0;
      console.log('Analytics data reset');
    }
  }

  startRealTimeUpdates() {
    // Update every second
    this.updateInterval = setInterval(() => {
      this.updateAnalyticsUI();
    }, 1000);
    
    // Initial update
    this.updateAnalyticsUI();
  }

  updateAnalyticsUI() {
    if (!this.analyticsUI || !this.analyticsTracker) return;
    
    try {
      const analytics = this.analyticsTracker.getAnalytics();
      
      // Session Overview
      this.updateElement('session-time', this.formatTime(analytics.sessionTime || 0));
      this.updateElement('active-time', this.formatTime(analytics.activeTime || 0));
      this.updateElement('pages-read', analytics.pagesRead || 0);
      this.updateElement('reading-speed', analytics.readingSpeed || 0);
      
      // Reading Progress
      const progressPercent = analytics.progressPercentage || 0;
      this.updateElement('progress-percentage', Math.round(progressPercent) + '%');
      
      const progressFill = document.getElementById('progress-fill');
      if (progressFill) {
        progressFill.style.width = progressPercent + '%';
      }
      
      this.updateElement('current-page', analytics.currentPage || this.currentPage);
      this.updateElement('total-pages', analytics.totalPages || this.totalPages);
      this.updateElement('words-read', (analytics.wordsRead || 0).toLocaleString());
      
      // Current Section
      if (analytics.currentSection) {
        this.updateElement('current-section-title', analytics.currentSection.title);
        this.updateElement('section-time', this.formatTime(analytics.currentSectionTime || 0));
        
        // Update confidence indicator
        const confidenceFill = document.getElementById('confidence-fill');
        if (confidenceFill) {
          confidenceFill.style.width = (this.sectionDetectionConfidence * 100) + '%';
        }
      } else {
        this.updateElement('current-section-title', 'No section detected');
        this.updateElement('section-time', '00:00');
      }
      
      // Sections
      this.updateElement('sections-completed', analytics.sectionsCompleted || 0);
      this.updateElement('sections-total', this.outlineStructure.length);
      this.updateSectionsList(analytics.sections || {});
      
      // Text Interactions
      this.updateElement('text-selections', analytics.textSelections || 0);
      this.updateElement('page-changes', analytics.pageChanges || 0);
      
      // Reading Patterns
      this.updateElement('forward-moves', analytics.forwardMoves || 0);
      this.updateElement('backward-moves', analytics.backwardMoves || 0);
      this.updateElement('jump-moves', analytics.jumpMoves || 0);
      this.updateElement('linear-percentage', Math.round(analytics.linearReadingPercentage || 0) + '%');
      
    } catch (error) {
      console.error('Error updating analytics UI:', error);
    }
  }

  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  updateSectionsList(sectionsData) {
    const sectionsList = document.getElementById('sections-list');
    if (!sectionsList) return;
    
    sectionsList.innerHTML = '';
    
    // Flatten sections for display
    const flatSections = this.flattenOutline(this.outlineStructure);
    
    flatSections.forEach(section => {
      const sectionData = sectionsData[section.id] || {};
      const div = document.createElement('div');
      div.className = 'section-item';
      
      // Determine section status
      if (this.currentSection && this.currentSection.id === section.id) {
        div.classList.add('current');
      } else if (sectionData.completed) {
        div.classList.add('completed');
      } else if (sectionData.timeSpent > 0) {
        div.classList.add('in-progress');
      } else {
        div.classList.add('unread');
      }
      
      const timeSpent = sectionData.timeSpent || 0;
      const visits = sectionData.visits || 0;
      
      div.innerHTML = `
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: ${div.classList.contains('current') ? '600' : '400'}; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${section.level > 1 ? '&nbsp;&nbsp;'.repeat(section.level - 1) + '└ ' : ''}${section.title}
              ${div.classList.contains('current') ? ' ◉' : ''}
              ${sectionData.completed ? ' ✓' : ''}
            </span>
            <div style="text-align: right; font-size: 10px; flex-shrink: 0; margin-left: 8px;">
              <div>${this.formatTime(timeSpent, true)}</div>
              ${visits > 0 ? `<div style="color: #6c757d;">${visits}x</div>` : ''}
            </div>
          </div>
        </div>
      `;
      
      sectionsList.appendChild(div);
    });
  }

  addActivity(message) {
    if (!this.activityLog) {
      this.activityLog = [];
    }
    
    const now = new Date();
    const timeStr = now.toTimeString().substr(0, 8);
    
    this.activityLog.unshift({
      time: timeStr,
      message: message,
      timestamp: now
    });
    
    // Keep only last 20 activities
    if (this.activityLog.length > 20) {
      this.activityLog = this.activityLog.slice(0, 20);
    }
    
    this.updateActivityFeed();
  }

  updateActivityFeed() {
    const activityFeed = document.getElementById('activity-feed');
    if (!activityFeed || !this.activityLog) return;
    
    activityFeed.innerHTML = '';
    
    this.activityLog.forEach(activity => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      div.innerHTML = `
        <span class="activity-time">${activity.time}</span> - ${activity.message}
      `;
      activityFeed.appendChild(div);
    });
    
    // If no activities, show placeholder
    if (this.activityLog.length === 0) {
      activityFeed.innerHTML = '<div class="activity-item">No recent activity</div>';
    }
  }

  formatTime(milliseconds, compact = false) {
    if (!milliseconds || milliseconds < 0) return compact ? "0m" : "00:00:00";
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (compact) {
      if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        return `${minutes}m`;
      } else {
        return `${seconds}s`;
      }
    } else {
      if (hours > 0) {
        const h = hours.toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
      } else {
        const m = minutes.toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      }
    }
  }

  destroy() {
    console.log('Destroying PDF Analytics...');
    
    // Clear timeouts
    if (this.sectionSwitchTimeout) {
      clearTimeout(this.sectionSwitchTimeout);
    }
    
    // Remove analytics UI
    if (this.analyticsUI) {
      this.analyticsUI.remove();
      this.analyticsUI = null;
    }
    
    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Remove event listeners
    this.eventListeners.forEach(({ element, eventName, handler, eventBus }) => {
      if (eventBus && this.eventBus) {
        this.eventBus._off(eventName, handler);
      } else if (element) {
        element.removeEventListener(eventName, handler);
      }
    });
    
    // Cleanup analytics tracker
    if (this.analyticsTracker) {
      this.analyticsTracker.destroy();
    }
    
    // Clear caches
    this.sectionDetectionCache.clear();
    this.pageToSectionMap.clear();
    
    // Clear references
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.eventBus = null;
    this.analyticsTracker = null;
    this.eventListeners = [];
    this.pageTextContent = {};
    
    this.isInitialized = false;
    console.log('PDF Analytics destroyed');
  }
}

// Global initialization function
window.initializePDFAnalytics = async function(options = {}) {
  // Create global instance
  if (window.pdfAnalyticsCore) {
    window.pdfAnalyticsCore.destroy();
  }
  
  window.pdfAnalyticsCore = new PDFAnalyticsCore();
  
  // Initialize and return result
  const result = await window.pdfAnalyticsCore.initializePDFAnalytics(options);
  
  if (result.success) {
    console.log('PDF Analytics ready!');
    
    // Expose useful methods globally
    window.getPDFAnalytics = () => window.pdfAnalyticsCore.getAnalyticsData();
    window.exportPDFAnalytics = () => window.pdfAnalyticsCore.exportAnalytics();
    
    // Set up periodic reporting if callback provided
    if (options.onAnalyticsUpdate) {
      setInterval(() => {
        const data = window.pdfAnalyticsCore.getAnalyticsData();
        options.onAnalyticsUpdate(data);
      }, 5000); // Update every 5 seconds
    }
  }
  
  return result;
};

// Auto-initialize if PDF.js is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.PDFViewerApplication) {
        console.log('Auto-initializing PDF Analytics...');
        window.initializePDFAnalytics({
          documentId: 'auto-detected',
          enableTextExtraction: true,
          sectionDetectionMode: 'hybrid'
        });
      }
    }, 1000);
  });
} else {
  setTimeout(() => {
    if (window.PDFViewerApplication) {
      console.log('Auto-initializing PDF Analytics...');
      window.initializePDFAnalytics({
        documentId: 'auto-detected',
        enableTextExtraction: true,
        sectionDetectionMode: 'hybrid'
      });
    }
  }, 1000);
}

console.log('PDF Analytics Core loaded. Use window.initializePDFAnalytics() to start tracking.');