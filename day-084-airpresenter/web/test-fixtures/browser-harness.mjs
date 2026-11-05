import {createBrowserApi} from '../../browser-api.js';
import {createSecureSession} from '../../session.js';
import {importPdf, createThumbnail} from '../../pdf-import.js';
Object.assign(window, {createBrowserApi, createSecureSession, importPdf, createThumbnail, modulesReady:true});
