export enum PublishMethodConstant {
    // Using api/zipdeploy endpoint in scm site
    ZipDeploy = 1,

    // Setting WEBSITE_RUN_FROM_PACKAGE app setting
    WebsiteRunFromPackageDeploy,
    
    // OneDeploy for function apps on Flex consumption plan
    OneDeployFlex
}