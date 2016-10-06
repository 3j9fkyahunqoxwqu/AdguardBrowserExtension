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

/* global Components, Prefs, ContextMenu, PopupButton, MobileMenu, UrlUtils, Utils, StringUtils, EventNotifier,
EventNotifierTypes, RequestTypes, userSettings, UiUtils, Log, contentScripts */

//var {Cc, Ci, Cu} = require('chrome');
//var self = require('sdk/self');
//var tabs = require('sdk/tabs');
//var unload = require('sdk/system/unload');
//var tabUtils = require('sdk/tabs/utils');
//var sdkWindows = require('sdk/windows').browserWindows;

/**
 * UI entry point.
 *
 * TODO: Drop addon-sdk with new tabs-api
 *
 * Initializes toolbar button and context menu.
 * Contains methods managing browser tabs (open/close tabs).
 */
var UI = exports.UI = {

    init: function (antiBannerService, framesMap, filteringLog, adguardApplication, SdkPanel, SdkContextMenu, SdkButton) {

        this.antiBannerService = antiBannerService;
        this.framesMap = framesMap;
        this.filteringLog = filteringLog;
        this.adguardApplication = adguardApplication;

        this._initContextMenu(SdkContextMenu);
        this._initAbusePanel(SdkPanel);
        this._initEventListener();

        if (Prefs.mobile) {
            MobileMenu.init(this);
        } else {
            PopupButton.init(this, SdkPanel, SdkButton);
        }

        //record frame and update popup button if needed
        var allTabs = this._getAllTabs();
        for (var i = 0; i < allTabs.length; i++) {
            var tab = allTabs[i];
            this.framesMap.recordFrame(tab, 0, tab.url, RequestTypes.DOCUMENT);
            this.framesMap.checkTabIncognitoMode(tab);
            this._updatePopupButtonState(tab);
        }

        //close all page on unload
        unload.when(UI.closeAllPages);
    },

    resetBlockedAdsCount: function () {
        this.framesMap.resetBlockedAdsCount();
    },

    openTab: function (url, options) {
        var activateSameTab, inNewWindow, tabType;
        if (options) {
            activateSameTab = options.activateSameTab;
            inNewWindow = options.inNewWindow;
            tabType = options.tabType;
        }
        try {
            if (activateSameTab) {
                for each (var tab in this._getAllTabs()) {
                    if (UrlUtils.urlEquals(tab.url, url)) {
                        if (tab.window) {
                            tab.window.activate();
                        }
                        if (tab.url != url) {
                            tab.url = url;
                        }
                        tab.activate();
                        return;
                    }
                }
            }
        } catch (ex) {
            //fennec catch
            Log.error("Error open tab, cause {0}", ex);
        }
        if (tabType == "popup" && !Prefs.mobile) {
            if (this.popupWindow && this.popupWindow.closed) {
                this.popupWindow = null;
            }
            if (this.popupWindow) {
                this.popupWindow.document.location.href = url;
                this.popupWindow.focus();
                return;
            }
            this.popupWindow = UiUtils.getMostRecentWindow().open(url, "_blank", "width=1230,height=630,menubar=0,status=no,toolbar=no,scrollbars=yes,resizable=yes");
        } else {
            tabs.open({
                url: url,
                inNewWindow: inNewWindow
            });
        }
    },

    getAllOpenedTabs: function (callback) {
        callback(this._getAllTabs());
    },

    openSiteReportTab: function (url) {
        var domain = UrlUtils.toPunyCode(UrlUtils.getDomainName(url));
        if (domain) {
            UI.openTab("https://adguard.com/site.html?domain=" + encodeURIComponent(domain) + "&utm_source=extension&aid=16593");
        }
    },

    openAbusePanel: function () {
        contentScripts.sendMessageToWorker(this.abusePanel, {type: 'initAbusePanel'});
        this.abusePanel.show();
    },

    openFilteringLog: function (tabId) {
        UI.openTab(UI._getURL("log.html") + (tabId ? "?tabId=" + tabId : ""), {activateSameTab: true, tabType: "popup"});
    },

    openCurrentTabFilteringLog: function () {
        var tabInfo = this.filteringLog.getTabInfo(this.getActiveTab());
        var tabId = tabInfo ? tabInfo.tabId : null;
        UI.openFilteringLog(tabId);
    },

    openSettingsTab: function (anchor) {
        UI.openTab(UI._getURL("options.html" + (anchor ? '#' + anchor : '')), {activateSameTab: true});
    },

    openFiltersDownloadPage: function () {
        UI.openTab(UI._getURL("filter-download.html"));
    },

    openThankYouPage: function () {

        var filtersDownloadUrl = UI._getURL("filter-download.html");
        var thankyouUrl = UI._getURL("thankyou.html");

        var windows = tabUtils.getAllTabContentWindows();
        for each (var win in windows) {
            if (!win.location) {
                continue;
            }
            if (win.location.href == filtersDownloadUrl || win.location.href == thankyouUrl) {
                if (win.location.href != thankyouUrl) {
                    win.location.href = thankyouUrl;
                }
                return;
            }
        }

        UI.openTab(thankyouUrl);
    },

    openExtensionStore: function () {
        var url = Utils.getExtensionStoreLink();
        UI.openTab(url);
    },

    closeAllPages: function () {
        try {
            var windows = tabUtils.getAllTabContentWindows();
            for each (var win in windows) {
                if (win.location && win.location.href.indexOf(UI._getURL('')) > -1) {
                    win.close();
                }
            }
        } catch (ex) {
            //ignore
        }
    },

    openExportRulesTab: function (whitelist) {
        UI.openTab(UI._getURL("export.html" + (whitelist ? '#wl' : '')));
    },

    reloadCurrentTab: function (url) {
        tabs.activeTab.url = url;
    },

    openAssistant: function (assistantOptions) {
        contentScripts.sendMessageToTab(tabs.activeTab, {
            type: 'initAssistant',
            options: {cssSelector: assistantOptions ? assistantOptions.cssSelector : null}
        });
    },

    getAssistantCssOptions: function () {
        return {
            cssLink: self.data.url("content/lib/content-script/assistant/css/assistant.css")
        };
    },

    resizePopup: function (width, height) {
        PopupButton.resizePopup(width, height);
    },

    closePopup: function () {
        PopupButton.closePopup();
    },

    updateCurrentTabButtonState: function () {
        var currentTab = this.getActiveTab();
        if (currentTab) {
            this._updatePopupButtonState(currentTab, true);
        }
    },

    whiteListTab: function (tab) {

        var tabInfo = this.framesMap.getFrameInfo(tab);
        this.antiBannerService.whiteListFrame(tabInfo);

        if (this.framesMap.isTabAdguardDetected(tab)) {
            var domain = UrlUtils.getHost(tab.url);
            this.adguardApplication.addRuleToApp("@@//" + domain + "^$document", function () {
                this._reloadWithoutCache(tab);
            }.bind(this));
        } else {
            this.updateCurrentTabButtonState();
        }
    },

    whiteListCurrentTab: function () {
        var tab = this.getActiveTab();
        this.whiteListTab(tab);
    },

    unWhiteListTab: function (tab) {

        var tabInfo = this.framesMap.getFrameInfo(tab);
        this.antiBannerService.unWhiteListFrame(tabInfo);

        if (this.framesMap.isTabAdguardDetected(tab)) {
            var rule = this.framesMap.getTabAdguardUserWhiteListRule(tab);
            if (rule) {
                this.adguardApplication.removeRuleFromApp(rule.ruleText, function () {
                    this._reloadWithoutCache(tab);
                }.bind(this));
            }
        } else {
            this.updateCurrentTabButtonState();
        }
    },

    unWhiteListCurrentTab: function () {
        var tab = this.getActiveTab();
        this.unWhiteListTab(tab);
    },

    changeApplicationFilteringDisabled: function (disabled) {
        this.antiBannerService.changeApplicationFilteringDisabled(disabled);
        this.updateCurrentTabButtonState();
    },

    getActiveTab: function () {
        var tab = tabs.activeTab;
        if (tab.id && tab.url) {
            return tab;
        }
        //https://bugzilla.mozilla.org/show_bug.cgi?id=942511
        var win = UiUtils.getMostRecentWindow();
        var xulTab = tabUtils.getActiveTab(win);
        var tabId = tabUtils.getTabId(xulTab);
        return {id: tabId};
    },

    getCurrentTabInfo: function (reloadFrameData) {
        var currentTab = this.getActiveTab();
        if (reloadFrameData) {
            this.framesMap.reloadFrameData(currentTab);
        }
        return this.framesMap.getFrameInfo(currentTab);
    },

    getCurrentTabFilteringInfo: function () {
        var currentTab = this.getActiveTab();
        return this.filteringLog.getTabInfo(currentTab);
    },

    isCurrentTabAdguardDetected: function () {
        var currentTab = this.getActiveTab();
        return this.framesMap.isTabAdguardDetected(currentTab);
    },

    checkAntiBannerFiltersUpdate: function () {
        this.antiBannerService.checkAntiBannerFiltersUpdate(true, function (updatedFilters) {
            EventNotifier.notifyListeners(EventNotifierTypes.UPDATE_FILTERS_SHOW_POPUP, true, updatedFilters);
        }, function () {
            EventNotifier.notifyListeners(EventNotifierTypes.UPDATE_FILTERS_SHOW_POPUP, false);
        });
    },

    getLocalizedMessage: function (messageId, args) {
        return i18n.getMessage(messageId, args);
    },

    showAlertMessagePopup: function (title, text) {
        contentScripts.sendMessageToTab(this.getActiveTab(), {type: 'show-alert-popup', title: title, text: text});
    },

    _initAbusePanel: function (SdkPanel) {
        this.abusePanelSupported = SdkPanel != null && typeof SdkPanel == 'function';
        if (!this.abusePanelSupported) {
            return;
        }
        this.abusePanel = SdkPanel({
            width: 552,
            height: 345,
            contentURL: self.data.url('content/lib/content-script/abuse.html'),
            contentScriptOptions: contentScripts.getContentScriptOptions(),
            contentScriptFile: [
                self.data.url('content/libs/jquery-2.2.4.min.js'),
                self.data.url('content/lib/content-script/content-script.js'),
                self.data.url('content/lib/content-script/i18n-helper.js'),
                self.data.url('content/pages/i18n.js'),
                self.data.url('content/lib/content-script/abuse.js')
            ]
        });

        contentScripts.addContentScriptMessageListener(this.abusePanel, function (message) {
            switch (message.type) {
                case 'sendFeedback':
                    var url = tabs.activeTab.url;
                    this.antiBannerService.sendFeedback(url, message.topic, message.comment);
                    break;
                case 'closeAbusePanel':
                    this.abusePanel.hide();
                    break;
            }
        }.bind(this));
    },

    _initContextMenu: function (SdkContextMenu) {
        if (SdkContextMenu != null) {
            ContextMenu.init(this, SdkContextMenu);
        }
    },

    _getURL: function (url) {
        return "chrome://adguard/content/" + url;
    },

    _initEventListener: function () {

        var framesMap = this.framesMap;

        EventNotifier.addListener(function (event, tab, reset) {

            if (event != EventNotifierTypes.UPDATE_TAB_BUTTON_STATE || !tab) {
                return;
            }

            if (Prefs.mobile) {
                return;
            }

            var activeTab = this.getActiveTab();
            if (tab.id != activeTab.id) {
                return;
            }

            if (reset) {
                PopupButton.updateBadgeText("0");
                PopupButton.updateIconState({disabled: true});
            } else {
                UI._updatePopupButtonState(tab);
            }

        }.bind(this));

        EventNotifier.addListener(function (event, rule, tab, blocked) {

            if (event != EventNotifierTypes.ADS_BLOCKED || !tab) {
                return;
            }
            
            var blockedAds = framesMap.updateBlockedAdsCount(tab, blocked);

            if (blockedAds == null || Prefs.mobile || !userSettings.showPageStatistic()) {
                return;
            }

            this._updateBadgeAsync(tab.id, blockedAds.toString());

        }.bind(this));

        var updateActiveTabIcon = function (tab) {
            var activeTab = this.getActiveTab();
            if (!tab.id || tab.id == activeTab.id) {
                this._updatePopupButtonState(activeTab, true);
            }
        }.bind(this);
        //tab events
        tabs.on('activate', updateActiveTabIcon);
        tabs.on('pageshow', updateActiveTabIcon);
        tabs.on('load', updateActiveTabIcon);
        tabs.on('ready', updateActiveTabIcon);
        //on focus change
        sdkWindows.on('activate', function () {
            var activeTab = this.getActiveTab();
            this._updatePopupButtonState(activeTab, true);
        }.bind(this));
    },

    _updateBadgeAsync: Utils.debounce(function (tabId, number) {
        var activeTab = UI.getActiveTab();
        if (tabId != activeTab.id) {
            return;
        }
        PopupButton.updateBadgeText(number);
    }, 250),

    _updatePopupButtonState: function (tab, reloadFrameData) {

        //in mobile version no sdk button
        if (Prefs.mobile) {
            return;
        }

        if (reloadFrameData) {
            this.framesMap.reloadFrameData(tab);
        }

        var disabled, blocked;

        var tabInfo = this.framesMap.getFrameInfo(tab);

        if (tabInfo.adguardDetected) {
            blocked = "";
            disabled = tabInfo.documentWhiteListed;
        } else {
            disabled = tabInfo.applicationFilteringDisabled;
            disabled = disabled || tabInfo.urlFilteringDisabled;
            disabled = disabled || tabInfo.documentWhiteListed;

            if (!disabled && userSettings.showPageStatistic()) {
                blocked = tabInfo.totalBlockedTab.toString();
            } else {
                blocked = "0";
            }
        }

        PopupButton.updateBadgeText(blocked);
        PopupButton.updateIconState({
            disabled: disabled,
            adguardDetected: tabInfo.adguardDetected
        });
    },

    _getAllTabs: function () {
        var result = [];
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            // Fennec case (tab maybe undefined)
            if (tab) {
                result.push(tab);
            }
        }
        return result;
    },

    _reloadWithoutCache: function (tab) {
        contentScripts.sendMessageToTab(tabs.activeTab, {type: 'no-cache-reload'});
    }
};
