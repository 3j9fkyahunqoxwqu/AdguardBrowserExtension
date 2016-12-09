/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global Cc, Ci, Services */

/**
 * This object manages CSS and JS rules.
 *
 * Depending on the user settings we can use one of the following ways:
 * 1. Registering browser-wide stylesheet
 * 2. Injecting CSS/JS with content-script/preload.js script
 */
adguard.ElemHide = (function (adguard) {

    'use strict';

    var styleService = (function () {

        var styleSheetService = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);

        function sheetRegistered(uri) {
            return styleSheetService.sheetRegistered(uri, styleSheetService.USER_SHEET);
        }

        var loadUserSheetByUri = function loadUserSheetByUri(uri) {
            if (sheetRegistered(uri)) {
                return;
            }
            styleSheetService.loadAndRegisterSheet(uri, styleSheetService.USER_SHEET);
            adguard.unload.when(unloadUserSheetByUri.bind(null, uri));
        };

        /**
         * Unregister our stylesheet by it's uri
         * @param uri
         */
        var unloadUserSheetByUri = function unloadUserSheetByUri(uri) {
            if (sheetRegistered(uri)) {
                styleSheetService.unregisterSheet(uri, styleSheetService.USER_SHEET);
            }
        };

        return {
            loadUserSheetByUri: loadUserSheetByUri,
            unloadUserSheetByUri: unloadUserSheetByUri
        };

    })();

    var ElemHide = {

        collapsedClass: null,
        collapseStyle: null,

        /**
         * Init ElemHide object
         */
        init: function () {

            this._registerCollapsedStyle();
            this._registerSelectorStyle();

            adguard.listeners.addListener(function (event, settings) {
                switch (event) {
                    case adguard.listeners.REQUEST_FILTER_UPDATED:
                        if (!this._isGlobalStyleSheetEnabled()) {
                            // Do nothing if global stylesheet is disabled
                            return;
                        }
                        this._saveStyleSheetToDisk();
                        break;
                    case adguard.listeners.CHANGE_PREFS:
                        if (settings === 'use_global_style_sheet') {
                            this.changeElemhideMethod(settings);
                        }
                        break;
                }
            }.bind(this));

            adguard.settings.onUpdated.addListener(function (setting) {
                if (setting === adguard.settings.DISABLE_COLLECT_HITS) {
                    this.changeElemhideMethod();
                }
            }.bind(this));

            if (this._isGlobalStyleSheetEnabled()) {
                this._applyCssStyleSheet(adguard.fileStorage.injectCssFileURI, true);
            }
        },

        /**
         * Called if user settings or prefs have been changed.
         * In this case we check "Send statistics for ad filters usage" option value or "use_global_style_sheet" preference.
         * If this flag has been changed - switching CSS injection method.
         */
        changeElemhideMethod: function () {
            if (this._isGlobalStyleSheetEnabled()) {
                this._saveStyleSheetToDisk();
            } else {
                styleService.unloadUserSheetByUri(adguard.fileStorage.injectCssFileURI);
            }
        },

        /**
         * Returns true if we should register global style sheet
         */
        _isGlobalStyleSheetEnabled: function () {
            return adguard.settings.collectHitsCount() || adguard.prefs.useGlobalStyleSheet;
        },

        shouldCollapseElement: function (tabId, cssPath) {

            if (!tabId) {
                return false;
            }

            var tab = {tabId: tabId};

            if (adguard.integration.isActive() ||
                adguard.settings.isFilteringDisabled() ||
                adguard.frames.isTabWhiteListed(tab)) {

                return false;
            }

            if (this._isElemHideWhiteListed(tab)) {
                return false;
            }

            var rule = this._getRuleByText(cssPath);
            if (rule) {
                var domain = adguard.frames.getFrameDomain(tab);
                if (!rule.isPermitted(domain)) {
                    return false;
                }

                // Rules without domain should be ignored if there is a $generichide rule applied
                if (this._isGenericHideWhiteListed(tab) && rule.isGeneric()) {
                    return false;
                }

                // Track filter rule usage if user has enabled "collect ad filters usage stats"
                if (adguard.settings.collectHitsCount() &&
                    !adguard.utils.filters.isUserFilterRule(rule) && !adguard.utils.filters.isWhiteListFilterRule(rule) &&
                    !adguard.frames.isIncognitoTab(tab)) {

                    adguard.hitStats.addRuleHit(domain, rule.ruleText, rule.filterId);
                }
            }

            return true;
        },

        _isElemHideWhiteListed: function (tab) {
            var elemHideWhiteListRule = adguard.tabs.getTabMetadata(tab.tabId, 'elemHideWhiteListRule');
            if (elemHideWhiteListRule || elemHideWhiteListRule === false) {
                return elemHideWhiteListRule;
            }
            var frame = adguard.tabs.getTabFrame(tab.tabId);
            if (frame) {
                elemHideWhiteListRule = adguard.requestFilter.findWhiteListRule(frame.url, frame.url, "ELEMHIDE");
                adguard.tabs.updateTabMetadata(tab.tabId, {
                    elemHideWhiteListRule: elemHideWhiteListRule || false
                });
            }
        },

        _isGenericHideWhiteListed: function (tab) {
            var genericHideWhiteListRule = adguard.tabs.getTabMetadata(tab.tabId, 'genericHideWhiteListRule');
            if (genericHideWhiteListRule || genericHideWhiteListRule === false) {
                return genericHideWhiteListRule;
            }
            var frame = adguard.tabs.getTabFrame(tab.tabId);
            if (frame) {
                genericHideWhiteListRule = adguard.requestFilter.findWhiteListRule(frame.url, frame.url, "GENERICHIDE");
                adguard.tabs.updateTabMetadata(tab.tabId, {
                    genericHideWhiteListRule: genericHideWhiteListRule || false
                });
            }
        },

        _getRuleByText: function (path) {
            var index = path.lastIndexOf('?');
            if (index > 0) {
                var key = path.substring(index + 1);
                var rule = adguard.requestFilter.findCssRuleByKey(key);
                return rule ? rule : null;
            }
            return null;
        },

        /**
         * Registers style for collapsing page node.
         * @private
         */
        _registerCollapsedStyle: function () {
            var offset = "a".charCodeAt(0);
            this.collapsedClass = "";
            for (var i = 0; i < 20; i++) {
                this.collapsedClass += String.fromCharCode(offset + Math.random() * 26);
            }
            this.collapseStyle = Services.io.newURI("data:text/css," + encodeURIComponent("." + this.collapsedClass + "{-moz-binding: url(chrome://global/content/bindings/general.xml#dummy) !important;}"), null, null);
            this._applyCssStyleSheet(this.collapseStyle);
            adguard.console.info("Adguard addon: Collapse style registered successfully");
        },

        /**
         * Registers "assistant" module style.
         * @private
         */
        _registerSelectorStyle: function () {
            this.selectorStyle = Services.io.newURI("data:text/css," + encodeURIComponent(adguard.loadURL('lib/content-script/assistant/css/selector.css')), null, null);
            this._applyCssStyleSheet(this.selectorStyle);
            adguard.console.info("Adguard addon: Selector style registered successfully");
        },

        /**
         * Saves CSS content built by CssFilter to file.
         * This file is then registered as browser-wide stylesheet.
         * @private
         */
        _saveStyleSheetToDisk: function () {
            adguard.utils.concurrent.runAsync(function () {
                var content = adguard.requestFilter.getCssForStyleSheet();
                adguard.fileStorage.saveStyleSheetToDisk(content, function () {
                    this._applyCssStyleSheet(adguard.fileStorage.injectCssFileURI);
                }.bind(this));
            }, this);
        },

        /**
         * Registers specified stylesheet
         * @param uri                   Stylesheet URI
         * @param needCheckFileExist    If true - check if file exists
         * @private
         */
        _applyCssStyleSheet: function (uri, needCheckFileExist) {
            try {
                if (uri) {
                    if (needCheckFileExist) {
                        if (uri.file) {
                            var exists = uri.file.exists();
                            if (!exists) {
                                adguard.console.info('Adguard addon: Css stylesheet cannot apply file: ' + uri.path + ' because file does not exist');
                                return;
                            }
                        }
                    }
                    //disable previous registered sheet
                    styleService.unloadUserSheetByUri(uri);
                    //load new stylesheet
                    styleService.loadUserSheetByUri(uri);
                    adguard.console.debug('styles hiding elements are successfully registered.');
                }
            } catch (ex) {
                adguard.console.error('Error while register stylesheet ' + uri + ':' + ex);
            }
        }
    };

    ElemHide.init();

    return ElemHide;

})(adguard);
