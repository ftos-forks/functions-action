"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureAppServiceUtility = void 0;
const WebClient_1 = require("azure-actions-webclient/WebClient");
const azure_app_kudu_service_1 = require("../Kudu/azure-app-kudu-service");
const Q = require("q");
const core = require("@actions/core");
var parseString = require('xml2js').parseString;
class AzureAppServiceUtility {
    constructor(appService, endpoint) {
        this._appService = appService;
        this._webClient = new WebClient_1.WebClient();
        this._endpoint = endpoint;
    }
    getWebDeployPublishingProfile() {
        return __awaiter(this, void 0, void 0, function* () {
            var publishingProfile = yield this._appService.getPublishingProfileWithSecrets();
            var defer = Q.defer();
            parseString(publishingProfile, (error, result) => {
                if (!!error) {
                    defer.reject(error);
                }
                var publishProfile = result && result.publishData && result.publishData.publishProfile ? result.publishData.publishProfile : null;
                if (publishProfile) {
                    for (var index in publishProfile) {
                        if (publishProfile[index].$ && publishProfile[index].$.publishMethod === "MSDeploy") {
                            defer.resolve(result.publishData.publishProfile[index].$);
                        }
                    }
                }
                defer.reject('Error : No such deploying method exists.');
            });
            return defer.promise;
        });
    }
    getApplicationURL(virtualApplication) {
        return __awaiter(this, void 0, void 0, function* () {
            let webDeployProfile = yield this.getWebDeployPublishingProfile();
            return (yield webDeployProfile.destinationAppUrl) + (virtualApplication ? "/" + virtualApplication : "");
        });
    }
    pingApplication() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                var applicationUrl = yield this.getApplicationURL();
                if (!applicationUrl) {
                    core.debug("Application Url not found.");
                    return;
                }
                yield this.pingApplicationWithUrl(applicationUrl);
            }
            catch (error) {
                core.debug("Unable to ping App Service. Error: ${error}");
            }
        });
    }
    pingApplicationWithUrl(applicationUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!applicationUrl) {
                core.debug('Application Url empty.');
                return;
            }
            try {
                var webRequest = {
                    method: 'GET',
                    uri: applicationUrl
                };
                let webRequestOptions = { retriableErrorCodes: [], retriableStatusCodes: [], retryCount: 1, retryIntervalInSeconds: 5, retryRequestTimedout: true };
                var response = yield this._webClient.sendRequest(webRequest, webRequestOptions);
                core.debug(`App Service status Code: '${response.statusCode}'. Status Message: '${response.statusMessage}'`);
            }
            catch (error) {
                core.debug(`Unable to ping App Service. Error: ${error}`);
            }
        });
    }
    getKuduService() {
        return __awaiter(this, void 0, void 0, function* () {
            var publishingCredentials = yield this._appService.getPublishingCredentials();
            var scmPolicyCheck = yield this.isSitePublishingCredentialsEnabled();
            if (publishingCredentials.properties["scmUri"]) {
                if (scmPolicyCheck === false) {
                    core.debug("Function App will use Bearer token for deployment.");
                    var accessToken = yield this._endpoint.getToken();
                    return new azure_app_kudu_service_1.Kudu(publishingCredentials.properties["scmUri"], "", "", accessToken);
                }
                else {
                    let userName = publishingCredentials.properties["publishingUserName"];
                    let password = publishingCredentials.properties["publishingPassword"];
                    // masking kudu password
                    console.log(`::add-mask::${password}`);
                    return new azure_app_kudu_service_1.Kudu(publishingCredentials.properties["scmUri"], userName, password);
                }
            }
            throw Error('KUDU SCM details are empty');
        });
    }
    isSitePublishingCredentialsEnabled() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let scmAuthPolicy = yield this._appService.getSitePublishingCredentialPolicies();
                core.debug(`Site Publishing Policy check: ${JSON.stringify(scmAuthPolicy)}`);
                if (scmAuthPolicy && scmAuthPolicy.properties.allow) {
                    core.debug("Function App does allow SCM access");
                    return true;
                }
                else {
                    core.debug("Function App does not allow SCM Access");
                    return false;
                }
            }
            catch (error) {
                core.debug(`Skipping SCM Policy check: ${error}`);
                return false;
            }
        });
    }
    updateConfigurationSettings(properties) {
        return __awaiter(this, void 0, void 0, function* () {
            for (var property in properties) {
                if (!!properties[property] && properties[property].value !== undefined) {
                    properties[property] = properties[property].value;
                }
            }
            console.log('Updating App Service Configuration settings. Data: ' + JSON.stringify(properties));
            yield this._appService.patchConfiguration({ 'properties': properties });
            console.log('Updated App Service Configuration settings.');
        });
    }
    updateAndMonitorAppSettings(addProperties, deleteProperties) {
        return __awaiter(this, void 0, void 0, function* () {
            var appSettingsProperties = {};
            for (var property in addProperties) {
                appSettingsProperties[addProperties[property].name] = addProperties[property].value;
            }
            if (!!addProperties) {
                console.log('Updating App Service Application settings. Data: ' + JSON.stringify(appSettingsProperties));
            }
            if (!!deleteProperties) {
                console.log('Deleting App Service Application settings. Data: ' + JSON.stringify(Object.keys(deleteProperties)));
            }
            var isNewValueUpdated = yield this._appService.patchApplicationSettings(appSettingsProperties, deleteProperties);
            yield this._appService.patchApplicationSettingsSlot(addProperties);
            if (!!isNewValueUpdated) {
                console.log('Updated App Service Application settings.');
            }
            return isNewValueUpdated;
        });
    }
    updateConnectionStrings(addProperties) {
        return __awaiter(this, void 0, void 0, function* () {
            var connectionStringProperties = {};
            for (var property in addProperties) {
                if (!addProperties[property].type) {
                    addProperties[property].type = "Custom";
                }
                if (!addProperties[property].slotSetting) {
                    addProperties[property].slotSetting = false;
                }
                connectionStringProperties[addProperties[property].name] = addProperties[property];
                delete connectionStringProperties[addProperties[property].name].name;
            }
            console.log('Updating App Service Connection Strings. Data: ' + JSON.stringify(connectionStringProperties));
            var isNewValueUpdated = yield this._appService.patchConnectionString(connectionStringProperties);
            yield this._appService.patchConnectionStringSlot(connectionStringProperties);
            if (!!isNewValueUpdated) {
                console.log('Updated App Service Connection Strings.');
            }
            return isNewValueUpdated;
        });
    }
}
exports.AzureAppServiceUtility = AzureAppServiceUtility;