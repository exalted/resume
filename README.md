# README

## Local development

### Prerequisites

```
brew install qpdf
```

The build requires `PII_EMAIL` and `PII_PHONE` environment variables. Use [envchain](https://github.com/sorah/envchain) to provide them:

```
envchain exalted-resume npm run site:dev
```
