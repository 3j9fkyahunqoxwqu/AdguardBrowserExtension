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

/**
 *  Initialize Content => BackgroundPage messaging
 */
(function (adguard) {

    'use strict';

    /**
     * Contains event listeners from content pages
     */
    var eventListeners = Object.create(null);

    /**
     * Adds event listener from content page
     * @param message
     * @param sender
     */
    function processAddEventListener(message, sender) {
        var listenerId = adguard.listeners.addSpecifiedListener(message.events, function () {
            var sender = eventListeners[listenerId];
            if (sender) {
                adguard.tabs.sendMessage(sender.tab.tabId, {
                    type: 'notifyListeners',
                    args: Array.prototype.slice.call(arguments)
                });
            }
        });
        eventListeners[listenerId] = sender;
        return {listenerId: listenerId};
    }

    /**
     * Constructs objects that uses on extension pages, like: options.html, thankyou.html etc
     */
    function processInitializeFrameScriptRequest() {

        var enabledFilters = Object.create(null);

        var AntiBannerFiltersId = adguard.utils.filters.ids;

        for (var key in AntiBannerFiltersId) {
            if (AntiBannerFiltersId.hasOwnProperty(key)) {
                var filterId = AntiBannerFiltersId[key];
                var enabled = adguard.filters.isFilterEnabled(filterId);
                if (enabled) {
                    enabledFilters[filterId] = true;
                }
            }
        }

        return {
            userSettings: adguard.settings.getAllSettings(),
            enabledFilters: enabledFilters,
            filtersMetadata: adguard.subscriptions.getFilters(),
            requestFilterInfo: adguard.requestFilter.getRequestFilterInfo(),
            contentBlockerInfo: adguard.requestFilter.getContentBlockerInfo(),
            environmentOptions: {
                isMacOs: adguard.utils.browser.isMacOs(),
                isSafariBrowser: adguard.utils.browser.isSafariBrowser(),
                isContentBlockerEnabled: adguard.utils.browser.isContentBlockerEnabled(),
                Prefs: {
                    locale: adguard.app.getLocale(),
                    mobile: adguard.prefs.mobile || false
                }
            },
            constants: {
                AntiBannerFiltersId: adguard.utils.filters.ids,
                EventNotifierTypes: adguard.listeners.events
            }
        };
    }

    /**
     * Returns collection of filters for selected group to display for user
     * @param groupId Group identifier
     * @returns {*|Array} List of filters
     */
    function getFiltersMetadataForGroup(groupId) {
        return adguard.subscriptions.getFilters().filter(function (f) {
            return f.groupId == groupId &&
                f.filterId != adguard.utils.filters.SEARCH_AND_SELF_PROMO_FILTER_ID;
        });
    }

    /**
     * Constructs filters metadata for options.html page
     */
    function processGetFiltersMetadata() {
        var groupsMeta = adguard.subscriptions.getGroups();
        var filtersMeta = Object.create(null);
        var enabledFilters = Object.create(null);
        var installedFilters = Object.create(null);
        for (var i = 0; i < groupsMeta.length; i++) {
            var groupId = groupsMeta[i].groupId;
            var filters = filtersMeta[groupId] = getFiltersMetadataForGroup(groupId);
            for (var j = 0; j < filters.length; j++) {
                var filter = filters[j];
                var installed = adguard.filters.isFilterInstalled(filter.filterId);
                var enabled = adguard.filters.isFilterEnabled(filter.filterId);
                if (installed) {
                    installedFilters[filter.filterId] = true;
                }
                if (enabled) {
                    enabledFilters[filter.filterId] = true;
                }
            }
        }
        return {
            groups: groupsMeta,
            filters: filtersMeta,
            enabledFilters: enabledFilters,
            installedFilters: installedFilters
        };
    }

    /**
     * Returns localization map by passed message identifiers
     * @param ids Message identifiers
     */
    function getLocalization(ids) {
        var result = {};
        for (var id in ids) {
            if (ids.hasOwnProperty(id)) {
                var current = ids[id];
                result[current] = adguard.i18n.getMessage(current);
            }
        }
        return result;
    }

    /**
     * Searches for whitelisted domains.
     *
     * @param offset Offset
     * @param limit Limit
     * @param text Search string
     * @returns {Array} Domains found
     */
    function searchWhiteListDomains(offset, limit, text) {
        var domains = adguard.whitelist.getWhiteListDomains();
        var result = [];
        for (var i = 0; i < domains.length; i++) {
            var domain = domains[i];
            if (!text || adguard.utils.strings.containsIgnoreCase(domain, text)) {
                result.push(domain);
            }
        }
        return limit ? result.slice(offset, offset + limit) : result;
    }

    /**
     * Searches for user rules.
     *
     * @param offset Offset
     * @param limit Limit
     * @param text Search string
     * @returns {Array} Rules found
     */
    function searchUserRules(offset, limit, text) {
        var userRules = adguard.userrules.getRules();
        var result = [];
        for (var i = 0; i < userRules.length; i++) {
            var ruleText = userRules[i];
            if (!text || adguard.utils.strings.containsIgnoreCase(ruleText, text)) {
                result.push(ruleText);
            }
        }
        return limit ? result.slice(offset, offset + limit) : result;
    }

    /**
     * Constructs assistant options. Includes css style and localization messages
     */
    function processLoadAssistant() {
        var options = {
            cssLink: adguard.getURL('lib/content-script/assistant/css/assistant.css')
        };
        var ids = [
            'assistant_select_element',
            'assistant_select_element_ext',
            'assistant_select_element_cancel',
            'assistant_block_element',
            'assistant_block_element_explain',
            'assistant_slider_explain',
            'assistant_slider_if_hide',
            'assistant_slider_min',
            'assistant_slider_max',
            'assistant_extended_settings',
            'assistant_apply_rule_to_all_sites',
            'assistant_block_by_reference',
            'assistant_block_similar',
            'assistant_block',
            'assistant_another_element',
            'assistant_preview',
            'assistant_preview_header',
            'assistant_preview_header_info',
            'assistant_preview_end',
            'assistant_preview_start'
        ];
        options.localization = getLocalization(ids);
        return options;
    }

    /**
     * Main function for processing messages from content-scripts
     *
     * @param message
     * @param sender
     * @param callback
     * @returns {*}
     */
    function handleMessage(message, sender, callback) {
        switch (message.type) {
            case 'unWhiteListFrame':
                adguard.userrules.unWhiteListFrame(message.frameInfo);
                break;
            case 'addEventListener':
                return processAddEventListener(message, sender);
            case 'removeListener':
                var listenerId = message.listenerId;
                adguard.listeners.removeListener(listenerId);
                delete eventListeners[listenerId];
                break;
            case 'initializeFrameScript':
                return processInitializeFrameScriptRequest();
            case 'changeUserSetting':
                adguard.settings.setProperty(message.key, message.value);
                break;
            case 'checkRequestFilterReady':
                return {ready: adguard.requestFilter.isReady()};
            case 'checkIntegrationStatus':
                return {
                    state: adguard.integration.getState(),
                    appInfo: adguard.integration.getAppInfo(),
                    disabledByUser: adguard.settings.isIntegrationDisabled()
                };
            case 'disableIntegration':
                adguard.integration.disable();
                break;
            case 'enableIntegration':
                adguard.integration.enable();
                break;
            case 'addAndEnableFilter':
                adguard.filters.addAndEnableFilters([message.filterId]);
                break;
            case 'removeAntiBannerFilter':
                adguard.filters.removeFilter(message.filterId);
                break;
            case 'enableAntiBannerFilter':
                adguard.filters.enableFilter(message.filterId);
                break;
            case 'disableAntiBannerFilter':
                adguard.filters.disableFilter(message.filterId);
                break;
            case 'getWhiteListDomains':
                var whiteListDomains = searchWhiteListDomains(message.offset, message.limit, message.text);
                return {rules: whiteListDomains};
            case 'getUserFilters':
                var rules = searchUserRules(message.offset, message.limit, message.text);
                return {rules: rules};
            case 'checkAntiBannerFiltersUpdate':
                adguard.ui.checkFiltersUpdates();
                break;
            case 'getAntiBannerFiltersForOptionsPage':
                var renderedFilters = adguard.filters.getFiltersForOptionsPage();
                return {filters: renderedFilters};
            case 'changeDefaultWhiteListMode':
                adguard.whitelist.changeDefaultWhiteListMode(message.enabled);
                break;
            case 'clearUserFilter':
                adguard.userrules.clearRules();
                break;
            case 'clearWhiteListFilter':
                adguard.whitelist.clearWhiteList();
                break;
            case 'addWhiteListDomains':
                adguard.whitelist.addToWhiteListArray(message.domains);
                break;
            case 'removeWhiteListDomain':
                adguard.whitelist.removeFromWhiteList(message.text);
                break;
            case 'addUserFilterRules':
                adguard.userrules.addRules(message.rules);
                break;
            case 'onFiltersSubscriptionChange':
                adguard.filters.onFiltersListChange(message.filterIds);
                break;
            case 'getFiltersMetadata':
                return processGetFiltersMetadata();
            case 'openThankYouPage':
                adguard.ui.openThankYouPage();
                break;
            case 'openExtensionStore':
                adguard.ui.openExtensionStore();
                break;
            case 'openFilteringLog':
                adguard.browserAction.close();
                adguard.ui.openFilteringLog(message.tabId);
                break;
            case 'openExportRulesTab':
                adguard.ui.openExportRulesTab(message.whitelist);
                break;
            case 'openSafebrowsingTrusted':
                adguard.safebrowsing.addToSafebrowsingTrusted(message.url);
                adguard.tabs.getActive(function (tab) {
                    adguard.tabs.reload(tab.tabId, message.url);
                });
                break;
            case 'openTab':
                adguard.ui.openTab(message.url, message.options);
                adguard.browserAction.close();
                break;
            case 'resetBlockedAdsCount':
                adguard.frames.resetBlockedAdsCount();
                adguard.browserAction.close();
                break;
            case 'getSelectorsAndScripts':
                if (adguard.utils.workaround.isFacebookIframe(message.documentUrl)) {
                    return {};
                }
                var cssAndScripts = adguard.webRequestService.processGetSelectorsAndScripts(sender.tab, message.documentUrl, message.loadTruncatedCss);
                return cssAndScripts || {};
            case 'checkWebSocketRequest':
                var block = adguard.webRequestService.checkWebSocketRequest(sender.tab, message.elementUrl, message.documentUrl);
                return {block: block, requestId: message.requestId};
            case 'processShouldCollapse':
                var collapse = adguard.webRequestService.processShouldCollapse(sender.tab, message.elementUrl, message.documentUrl, message.requestType);
                return {collapse: collapse, requestId: message.requestId};
            case 'processShouldCollapseMany':
                var requests = adguard.webRequestService.processShouldCollapseMany(sender.tab, message.documentUrl, message.requests);
                return {requests: requests};
            case 'loadAssistant':
                return processLoadAssistant();
            case 'addUserRule':
                adguard.userrules.addRules([message.ruleText]);
                if (adguard.integration.isActive()) {
                    adguard.integration.addRule(message.ruleText);
                }
                break;
            case 'removeUserRule':
                adguard.userrules.removeRule(message.ruleText);
                if (adguard.integration.isActive()) {
                    adguard.integration.removeRule(message.ruleText);
                }
                break;
            case 'onOpenFilteringLogPage':
                adguard.filteringLog.onOpenFilteringLogPage();
                break;
            case 'onCloseFilteringLogPage':
                adguard.filteringLog.onCloseFilteringLogPage();
                break;
            case 'reloadTabById':
                adguard.tabs.reload(message.tabId);
                break;
            case 'clearEventsByTabId':
                adguard.filteringLog.clearEventsByTabId(message.tabId);
                break;
            case 'getTabFrameInfoById':
                if (message.tabId) {
                    var frameInfo = adguard.frames.getFrameInfo({tabId: message.tabId});
                    return {frameInfo: frameInfo};
                } else {
                    adguard.tabs.getActive(function (tab) {
                        var frameInfo = adguard.frames.getFrameInfo(tab);
                        callback({frameInfo: frameInfo});
                    });
                    return true; // Async
                }
                break;
            case 'getFilteringInfoByTabId':
                var filteringInfo = adguard.filteringLog.getFilteringInfoByTabId(message.tabId);
                return {filteringInfo: filteringInfo};
            case 'synchronizeOpenTabs':
                adguard.filteringLog.synchronizeOpenTabs(function () {
                    callback({});
                });
                return true; // Async
            case 'checkSubscriptionUrl':
                var filterMetadata = adguard.filters.findFilterMetadataBySubscriptionUrl(message.url);
                var confirmText;
                if (filterMetadata) {
                    //ok, filter found
                    confirmText = adguard.i18n.getMessage('abp_subscribe_confirm_enable', [filterMetadata.name]);
                } else {
                    //filter not found
                    confirmText = adguard.i18n.getMessage('abp_subscribe_confirm_import', [message.title]);
                }
                return {confirmText: confirmText};
            case 'enableSubscription':
                adguard.filters.processAbpSubscriptionUrl(message.url, function (rulesAddedCount) {
                    callback({
                        title: adguard.i18n.getMessage('abp_subscribe_confirm_import_finished_title'),
                        text: adguard.i18n.getMessage('abp_subscribe_confirm_import_finished_text', [rulesAddedCount])
                    });
                });
                return true; // Async
            // Popup methods
            case 'addWhiteListDomainPopup':
                adguard.tabs.getActive(function (tab) {
                    adguard.ui.whiteListTab(tab);
                });
                break;
            case 'removeWhiteListDomainPopup':
                adguard.tabs.getActive(function (tab) {
                    adguard.ui.unWhiteListTab(tab);
                });
                break;
            case 'changeApplicationFilteringDisabled':
                adguard.settings.changeFilteringDisabled(message.disabled);
                break;
            case 'openSiteReportTab':
                adguard.ui.openSiteReportTab(message.url);
                adguard.browserAction.close();
                break;
            case 'openSettingsTab':
                adguard.ui.openSettingsTab();
                adguard.browserAction.close();
                break;
            case 'openAssistant':
                adguard.ui.openAssistant();
                adguard.browserAction.close();
                break;
            case 'resizePanelPopup':
                adguard.browserAction.resize(message.width, message.height);
                break;
            case 'sendFeedback':
                adguard.backend.sendUrlReport(message.url, message.topic, message.comment);
                break;
            default :
                throw 'Unknown message: ' + message;
        }
    }

    // Add event listener from content-script messages
    adguard.runtime.onMessage.addListener(handleMessage);

})(adguard);

