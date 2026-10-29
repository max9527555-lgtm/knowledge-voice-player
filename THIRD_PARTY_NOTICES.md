# Third-party notices

Unmodified upstream JavaScript bundles are distributed in `vendor/` and copied into `dist/vendor/`.

| Package | Version | Repository | License file |
| --- | --- | --- | --- |
| pdfjs-dist / PDF.js | 6.4.299 | https://github.com/mozilla/pdf.js | vendor/pdf-LICENSE (Apache-2.0) |
| mammoth | 1.13.0 | https://github.com/mwilliamson/mammoth.js | vendor/mammoth-LICENSE (BSD-2-Clause) |
| fflate | 0.8.3 | https://github.com/101arrowz/fflate | vendor/fflate-LICENSE (MIT) |

PDF.js CMap data is taken from the same npm package, under the PDF.js license. The Mammoth upstream browser bundle retains upstream bundled code and notices. Development-only pdf-lib and Playwright are not included in the deployable application; their package licenses apply when installed.
