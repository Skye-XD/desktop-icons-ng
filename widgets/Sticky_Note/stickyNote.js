/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022 - 2026 Sundeep Mediratta (smedius@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import {DingClient} from './widgetHelper.js';

const STICKY_WIDGET_ID = 'sticky.note';
const DEFAULT_FONT = 'Noto Sans, sans-serif';
const DEFAULT_HOST_STATE = {
    editMode: false,
    widgetEditMode: false,
    pinned: false,
    pinnable: false,
    selected: false,
};
const COLOR_THEMES = {
    yellow: {paper: '#efe6b4', top: '#f0e28a'},
    pink: {paper: '#f0d6df', top: '#ebb7cc'},
    mint: {paper: '#d9eddc', top: '#bde4c3'},
    blue: {paper: '#d7e7f4', top: '#b8d4ed'},
    peach: {paper: '#f5dfcf', top: '#edc4a5'},
    lavender: {paper: '#e4dcf2', top: '#cdc0e9'},
};

class StickyNoteWidget {
    constructor() {
        this.client = new DingClient({mode: 'widget'});
        this.config = {
            contentHtml: '',
            fontSize: 17,
            fontFamily: DEFAULT_FONT,
            noteColor: 'yellow',
        };

        this.editor = document.getElementById('editor');
        this.noteShell = document.getElementById('note-shell');
        this.title = this.noteShell.querySelector('.title');
        this.newButton = document.getElementById('btn-new');
        this.pinButton = document.getElementById('btn-pin');
        this.moveButton = document.getElementById('btn-move');
        this.colorButtons =
            Array.from(this.noteShell.querySelectorAll('[data-color]'));
        this.editButton = document.getElementById('btn-edit');
        this.closeButton = document.getElementById('btn-close');
        this.fontSelect = document.getElementById('font-select');
        this.toolbars =
            Array.from(this.noteShell.querySelectorAll('.note-toolbar'));
        this.actionButtons =
            Array.from(this.noteShell.querySelectorAll('[data-action]'));
        this.linkDialogBackdrop =
        document.getElementById('link-dialog-backdrop');
        this.linkInput = document.getElementById('link-input');
        this.linkApplyButton = document.getElementById('link-apply');
        this.linkCancelButton = document.getElementById('link-cancel');
        this.linkRemoveButton = document.getElementById('link-remove');

        this._isEditing = false;
        this._savedRange = null;
        this._wakeRefreshRaf = 0;
        this._hostState = null;
        this._wireUi();
        this._wireClient();
        this._init()
            .catch(
                error =>
                    this.client
                        .error('Sticky init failed', error?.message ?? error)
            );
    }

    async _init() {
        const config = await this.client.getConfig().catch(() => null);
        if (config && typeof config === 'object')
            this.config = {...this.config, ...config};

        const initialHostState = this.client.getHostState();
        if (initialHostState) {
            this._hostState = {
                ...DEFAULT_HOST_STATE,
                ...initialHostState,
            };
        }

        this._applyConfig({applyContent: true});
        this._syncHostUi();
    }

    _wireUi() {
        this.editor.addEventListener('input', () => {
            this._updateHeaderFromEditor();
            this._updateToolbarState();
        });

        this.editor.addEventListener('keyup', () => {
            this._updateToolbarState();
        });

        this.client.bindPinnedHoverChrome(this.noteShell);

        const topbar = this.noteShell.querySelector('.note-topbar');

        this.noteShell.addEventListener('mousedown', event => {
            const chromeControl = event.target?.closest?.(
                '#btn-new, #btn-pin, #btn-move, #btn-edit, #btn-close, .color-chip'
            );
            if (!chromeControl)
                return;

            // Keep focus anchored in the editor while using note chrome.
            event.preventDefault();
        }, true);

        topbar?.addEventListener('mousedown', event => {
            if (!this._currentHostState().pinned)
                return;

            if (event.target?.closest?.(
                '#btn-new, #btn-pin, #btn-move, #btn-edit, #btn-close'
            ))
                return;

            event.preventDefault();
            this.client.beginPinnedWindowMove(event);
        });

        this.editor.addEventListener('click', event => {
            const item = event.target?.closest?.('ul.checklist > li');
            if (item) {
                const rect = item.getBoundingClientRect();
                if ((event.clientX - rect.left) <= 22) {
                    event.preventDefault();
                    item.classList.toggle('checked');
                    this._commit();
                }
            }

            this._updateToolbarState();
        });

        this.newButton.addEventListener('click', event => {
            event.preventDefault();
            this.client.createWidget(STICKY_WIDGET_ID);
        });

        this.pinButton.addEventListener('click', event => {
            event.preventDefault();
            const nextPinned = !this._currentHostState().pinned;
            if (this._isEditing)
                this._commit();
            else
                this._saveConfig();
            this.client.setPinned(nextPinned);
        });

        this.moveButton.addEventListener('click', event => {
            event.preventDefault();
            if (!this._currentHostState().pinned)
                return;

            this.client.beginPinnedWindowMove(event);
        });

        this.editButton.addEventListener('click', event => {
            event.preventDefault();
            const hostState = this._currentHostState();
            const nextEditing = !hostState.widgetEditMode;
            if (this._isEditing)
                this._commit();
            else
                this._saveConfig();
            this._requestPinnedEdit(nextEditing);
        });

        this.closeButton.addEventListener('click', event => {
            event.preventDefault();
            this.client.removeWidget();
        });

        this.noteShell.addEventListener('click', event => {
            const color =
                event.target?.closest?.('[data-color]')?.dataset?.color;

            if (!color)
                return;

            this.config.noteColor = color;
            this._applyColorTheme();
            this._saveConfig();
        });

        for (const toolbar of this.toolbars) {
            toolbar.addEventListener('mousedown', event => {
                if (event.target?.closest?.('select'))
                    return;
                event.preventDefault();
            });

            toolbar.addEventListener('click', event => {
                const action =
                    event.target?.closest?.('[data-action]')?.dataset?.action;

                if (!action)
                    return;

                this._runToolbarAction(action);
            });
        }

        this.fontSelect.addEventListener('change', () => {
            this.config.fontFamily = this.fontSelect.value;
            this._applyFontFamily();
            this._saveConfig();
        });

        this.linkApplyButton.addEventListener('click', () => {
            this._applyLinkDialog();
        });
        this.linkCancelButton.addEventListener('click', () => {
            this._closeLinkDialog();
        });
        this.linkRemoveButton.addEventListener('click', () => {
            this._applyLinkRemoval();
        });
        this.linkInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this._applyLinkDialog();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this._closeLinkDialog();
            }
        });
        this.linkDialogBackdrop.addEventListener('click', event => {
            if (event.target === this.linkDialogBackdrop)
                this._closeLinkDialog();
        });

        this.client.onVisibilityChange(visible => {
            if (!visible)
                return;
            this._scheduleWakeRefresh('visibilitychange');
        });

        window.addEventListener('pageshow', () => {
            this._scheduleWakeRefresh('pageshow');
        });

        window.addEventListener('focus', () => {
            this._scheduleWakeRefresh('focus');
        });

        window.addEventListener('resize', () => {
            this._scheduleWakeRefresh('resize');
        });

        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            const anchorNode = selection?.anchorNode;
            if (!anchorNode)
                return;

            if (!this.editor.contains(anchorNode) &&
                !(anchorNode.nodeType === Node.ELEMENT_NODE &&
                    anchorNode === this.editor
                )
            )
                return;

            this._updateToolbarState();
        });
    }

    _wireClient() {
        this.client.onHostState(state => {
            this._hostState = {
                ...DEFAULT_HOST_STATE,
                ...(state || {}),
            };
            this._syncHostUi();
        });

        this.client.onConfigChanged?.(config => {
            if (!config || typeof config !== 'object')
                return;

            this.config = {...this.config, ...config};
            this._applyConfig({applyContent: !this._isEditing});
        });
        this.client.onBackendEvent?.(() => {});
    }

    _commit() {
        this.config.contentHtml = this.editor.innerHTML ?? '';
        this._saveConfig();
    }

    _runToolbarAction(action) {
        if (!this._isEditing)
            return;

        this.editor.focus();

        switch (action) {
        case 'font-down':
            this._setFontSize(this.config.fontSize - 2);
            break;
        case 'font-up':
            this._setFontSize(this.config.fontSize + 2);
            break;
        case 'bold':
            document.execCommand('bold');
            break;
        case 'italic':
            document.execCommand('italic');
            break;
        case 'underline':
            document.execCommand('underline');
            break;
        case 'strike':
            document.execCommand('strikeThrough');
            break;
        case 'align-left':
            document.execCommand('justifyLeft');
            break;
        case 'align-center':
            document.execCommand('justifyCenter');
            break;
        case 'align-right':
            document.execCommand('justifyRight');
            break;
        case 'list-ul':
            document.execCommand('insertUnorderedList');
            this._clearChecklistOnSelection();
            break;
        case 'list-ol':
            document.execCommand('insertOrderedList');
            this._clearChecklistOnSelection();
            break;
        case 'heading-1':
            this._formatBlock('h1');
            break;
        case 'heading-2':
            this._formatBlock('h2');
            break;
        case 'heading-3':
            this._formatBlock('h3');
            break;
        case 'blockquote':
            this._formatBlock('blockquote');
            break;
        case 'link':
            this._insertLink();
            break;
        case 'checklist':
            this._toggleChecklist();
            break;
        case 'clear-format':
            this._clearFormatting();
            break;
        default:
            return;
        }

        if (action !== 'link')
            this._commit();
        else
            this._updateHeaderFromEditor();
    }

    _saveConfig() {
        const header = this._updateHeaderFromEditor();
        const nextConfig = {
            contentHtml: this.config.contentHtml,
            fontSize: this.config.fontSize,
            fontFamily: this.config.fontFamily,
            noteColor: this.config.noteColor,
            noteTitle: header,
        };

        this.client.setConfig(nextConfig).catch(() => {});
    }

    _applyConfig({applyContent = false} = {}) {
        this._setFontSize(this.config.fontSize, false);
        this._applyFontFamily();
        this._applyColorTheme();

        if (applyContent)
            this._applyStoredContent();
        else
            this._updateHeaderFromEditor();

        this._updateToolbarState();
    }

    _applyStoredContent() {
        const contentHtml =
            typeof this.config.contentHtml === 'string'
                ? this.config.contentHtml
                : '';

        if (this.editor.innerHTML !== contentHtml)
            this.editor.innerHTML = contentHtml;

        this._normalizeLinks();
        this._updateHeaderFromEditor();
        this._updateToolbarState();
    }

    _scheduleWakeRefresh(_reason = 'wake') {
        if (this._wakeRefreshRaf)
            cancelAnimationFrame(this._wakeRefreshRaf);

        this._wakeRefreshRaf = requestAnimationFrame(() => {
            this._wakeRefreshRaf = 0;
            this._refreshAfterWake();
        });
    }

    _refreshAfterWake() {
        this._setFontSize(this.config.fontSize, false);
        this._applyFontFamily();
        this._applyColorTheme();

        if (!this._isEditing)
            this._applyStoredContent();
        else
            this._normalizeLinks();

        // Trigger layout and style recalculation to work around
        // WebKit rendering issues after wake.
        void this.noteShell.offsetHeight; // Side-effect to trigger reflow.
        this.noteShell.classList.toggle('wake-refresh');
        this.noteShell.classList.toggle('wake-refresh');
        this._updateHeaderFromEditor();
        this._updateToolbarState();
    }

    _setFontSize(size, save = true) {
        const clamped = Math.max(14, Math.min(72, Number(size) || 14));
        this.config.fontSize = clamped;
        this.editor.style.fontSize = `${clamped}px`;
        if (save)
            this._saveConfig();
    }

    _applyFontFamily() {
        const configured = this.config.fontFamily || DEFAULT_FONT;
        const selected =
            [...this.fontSelect.options]
            .some(option => option.value === configured)
                ? configured
                : DEFAULT_FONT;

        this.config.fontFamily = selected;
        this.fontSelect.value = selected;
        this.editor.style.fontFamily = this._toCssFontStack(selected);
    }

    _applyColorTheme() {
        const key =
            Object.prototype.hasOwnProperty
            .call(COLOR_THEMES, this.config.noteColor)
                ? this.config.noteColor
                : 'yellow';
        const theme = COLOR_THEMES[key];

        this.config.noteColor = key;
        this.noteShell.style.setProperty('--paper', theme.paper);
        this.noteShell.style.setProperty('--paper-top', theme.top);

        for (const button of this.colorButtons)
            button.classList.toggle('is-active', button.dataset?.color === key);
    }

    _updateHeaderFromEditor() {
        return this._updateHeaderFromText(this.editor.innerText ?? '');
    }

    _updateHeaderFromText(text) {
        const normalized = String(text ?? '').replace(/\r/g, '');
        const firstLine = normalized
            .split('\n')
            .map(line => this._sanitizeHeaderLine(line))
            .find(line => line.length > 0) ?? '';

        this.title.textContent = firstLine || 'Sticky Note';
        return firstLine;
    }

    _updateToolbarState() {
        const base = this._selectionBaseElement();
        const currentList = base?.closest?.('ul, ol') ?? null;
        const isChecklist = !!currentList?.classList?.contains('checklist');
        const isBlockquote = !!base?.closest?.('blockquote');

        const states = {
            bold: this._queryCommandState('bold'),
            italic: this._queryCommandState('italic'),
            underline: this._queryCommandState('underline'),
            strike: this._queryCommandState('strikeThrough'),
            'align-left': this._queryCommandState('justifyLeft'),
            'align-center': this._queryCommandState('justifyCenter'),
            'align-right': this._queryCommandState('justifyRight'),
            'list-ul': !!currentList &&
                currentList.tagName.toLowerCase() === 'ul' &&
                !isChecklist,
            'list-ol': !!currentList &&
                currentList.tagName.toLowerCase() === 'ol',
            checklist: isChecklist,
            blockquote: isBlockquote,
            link: !!base?.closest?.('a'),
        };

        for (const element of this.actionButtons) {
            const action = element.dataset.action;
            element.classList.toggle('is-active', !!states[action]);
        }
    }

    _selectionBaseElement() {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        if (!anchor)
            return null;

        if (anchor.nodeType === Node.ELEMENT_NODE)
            return anchor;

        return anchor.parentElement;
    }

    _queryCommandState(command) {
        try {
            return !!document.queryCommandState(command);
        } catch {
            return false;
        }
    }

    _sanitizeHeaderLine(line) {
        return String(line ?? '')
            .replace(/^\s*[•\-*+]\s+/, '')
            .replace(/^\s*\d+\.\s+/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _formatBlock(tagName) {
        document.execCommand('formatBlock', false, tagName);
    }

    _insertLink() {
        if (!this._isEditing)
            return;
        this._savedRange = this._captureRange();
        const anchor = this._closestAnchor();
        this.linkInput.value = anchor?.getAttribute('href') ?? 'https://';
        this.linkDialogBackdrop.hidden = false;
        this.linkRemoveButton.hidden = !anchor;
        this.linkInput.focus();
        this.linkInput.select();
    }

    _toggleChecklist() {
        document.execCommand('insertUnorderedList');
        const list = this._closestList();
        if (!list || list.tagName.toLowerCase() !== 'ul')
            return;

        list.classList.toggle('checklist');
        if (!list.classList.contains('checklist')) {
            for (const item of list.querySelectorAll('li.checked'))
                item.classList.remove('checked');
        }
    }

    _clearChecklistOnSelection() {
        const list = this._closestList();
        if (!list)
            return;
        list.classList.remove('checklist');
        for (const item of list.querySelectorAll('li.checked'))
            item.classList.remove('checked');
    }

    _clearFormatting() {
        document.execCommand('removeFormat');
        document.execCommand('unlink');

        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const base =
            anchor?.nodeType === Node.ELEMENT_NODE
                ? anchor
                : anchor?.parentElement;

        if (!base)
            return;

        const block = base.closest('blockquote,h1,h2,h3,li');
        if (!block)
            return;

        if (block.tagName?.toLowerCase() === 'li') {
            const list = block.closest('ul, ol');
            if (!list)
                return;

            const paragraph = document.createElement('p');
            paragraph.innerHTML = block.innerHTML;
            list.parentNode?.insertBefore(paragraph, list.nextSibling);
            block.remove();
            if (!list.querySelector('li'))
                list.remove();
            this._placeCaretAtEnd(paragraph);
            return;
        }

        const paragraph = document.createElement('p');
        paragraph.innerHTML = block.innerHTML;
        block.replaceWith(paragraph);
        this._placeCaretAtEnd(paragraph);
    }

    _closestList() {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const base =
            anchor?.nodeType === Node.ELEMENT_NODE
                ? anchor
                : anchor?.parentElement;
        return base?.closest?.('ul, ol') ?? null;
    }

    _closestAnchor() {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        return this._closestAnchorFromNode(anchor);
    }

    _closestAnchorFromNode(node) {
        const base =
            node?.nodeType === Node.ELEMENT_NODE
                ? node
                : node?.parentElement;
        return base?.closest?.('a') ?? null;
    }

    _captureRange() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return null;
        return selection.getRangeAt(0).cloneRange();
    }

    _restoreRange() {
        if (!this._savedRange)
            return;

        const selection = window.getSelection();
        if (!selection)
            return;

        selection.removeAllRanges();
        selection.addRange(this._savedRange);
    }

    _unwrapElement(element) {
        const parent = element?.parentNode;
        if (!parent)
            return;

        while (element.firstChild)
            parent.insertBefore(element.firstChild, element);
        parent.removeChild(element);
    }

    _applyLinkDialog() {
        const url = this.linkInput.value.trim();
        this._closeLinkDialog(false);
        this.editor.focus();
        this._restoreRange();

        const anchor = this._closestAnchor();
        const selection = window.getSelection();
        const selectedText = selection?.toString() ?? '';
        const range =
            selection && selection.rangeCount > 0
                ? selection.getRangeAt(0)
                : null;

        if (!url) {
            if (anchor)
                this._unwrapElement(anchor);
            else
                document.execCommand('unlink');
            return;
        }

        if (anchor) {
            anchor.setAttribute('href', url);
            if (!anchor.textContent?.trim())
                anchor.textContent = url;
        } else if (!selectedText.trim()) {
            if (range) {
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.textContent = url;
                range.deleteContents();
                range.insertNode(link);
                this._placeCaretAfter(link);
            }
        } else {
            this._wrapRangeWithLink(range, url);
        }

        this._normalizeLinks();
        this._savedRange = null;
        this._commit();
    }

    _applyLinkRemoval() {
        this._closeLinkDialog(false);
        this.editor.focus();
        this._restoreRange();

        const anchor = this._closestAnchor();
        if (anchor)
            this._unwrapElement(anchor);
        else
            document.execCommand('unlink');

        this._savedRange = null;
        this._commit();
    }

    _closeLinkDialog(clearRange = true) {
        this.linkDialogBackdrop.hidden = true;
        this.linkInput.value = '';
        if (clearRange)
            this._savedRange = null;
    }

    _requestPinnedEdit(editing) {
        this.client.beginPinnedEdit(!!editing);
    }

    _currentHostState() {
        return {
            ...DEFAULT_HOST_STATE,
            ...(this._hostState || {}),
        };
    }

    _syncHostUi() {
        const hostState = this._currentHostState();
        const shouldEdit = !!hostState.widgetEditMode;
        const enteredEditMode = shouldEdit && !this._isEditing;
        const exitedEditMode = !shouldEdit && this._isEditing;

        this.noteShell.classList.toggle('widget-selected', !!hostState.selected);
        this._updatePinButton();

        if (enteredEditMode)
            this._setEditing(true);
        else if (exitedEditMode)
            this._setEditing(false);

        if (enteredEditMode)
            this._focusEditorAtEnd();
    }

    _normalizeLinks() {
        for (const anchor of this.editor.querySelectorAll('a')) {
            if (this._isEditing)
                anchor.removeAttribute('contenteditable');
            else
                anchor.setAttribute('contenteditable', 'false');
            anchor.setAttribute('draggable', 'false');
        }
    }

    _placeCaretAtEnd(element) {
        const selection = window.getSelection();
        if (!selection)
            return;

        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    _focusEditorAtEnd() {
        this.editor.focus();
        this._placeCaretAtEnd(this.editor);
    }

    _placeCaretAfter(element) {
        const selection = window.getSelection();
        if (!selection || !element?.parentNode)
            return;

        const range = document.createRange();
        range.setStartAfter(element);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    _wrapRangeWithLink(range, url) {
        if (!range)
            return;

        const link = document.createElement('a');
        link.setAttribute('href', url);

        try {
            const fragment = range.extractContents();
            link.appendChild(fragment);
            range.insertNode(link);
            this._placeCaretAfter(link);
            return;
        } catch {
            // Fallback for awkward partial selections across nodes.
        }

        document.execCommand(
            'insertHTML',
            false,
            `<a href="${this._escapeAttribute(url)}">${this._escapeHtml(range.toString())}</a>`
        );
    }

    _setEditing(editing) {
        this._isEditing = !!editing;
        this.noteShell.classList.toggle('note-editing', this._isEditing);
        this.editor.setAttribute(
            'contenteditable',
            this._isEditing ? 'true' : 'false'
        );
        this.editor.spellcheck = this._isEditing;
        this.editButton.classList.toggle('is-active', this._isEditing);
        this._normalizeLinks();
        if (!this._isEditing)
            this._closeLinkDialog();
    }

    _updatePinButton() {
        const hostState = this._currentHostState();
        const pinned = !!hostState.pinned;
        const editMode = !!hostState.editMode;

        let label = pinned ? 'Unpin note' : 'Pin note';
        if (pinned && editMode)
            label = 'Unpin note (currently pinned while editing)';

        this.pinButton.setAttribute('aria-label', label);
        this.pinButton.title = label;
        this.pinButton.classList.toggle('is-pinned', pinned);
        this.pinButton.classList.toggle('is-pinned-edit', pinned && editMode);
    }

    _toCssFontStack(stack) {
        return String(stack ?? '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .map(name => {
                if (name.includes('"') || name.startsWith("'"))
                    return name;
                if (/^[a-z-]+$/i.test(name))
                    return name;
                return `"${name}"`;
            })
            .join(', ');
    }

    _escapeAttribute(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    _escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

}

window.addEventListener('DOMContentLoaded', () => {
    new StickyNoteWidget();
});
