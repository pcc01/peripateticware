/**
 * Brand constants — NEVER pass these through t() or any i18n pipeline.
 * "Peripateticware" is a proper noun / registered product name.
 * It must appear identically in every language.
 */

export const PRODUCT_NAME = 'Peripateticware';
export const PRODUCT_TAGLINE = 'Learning happens outside.';
export const PRODUCT_COPYRIGHT = (year: number = 2026) => `© ${year} ${PRODUCT_NAME}. All rights reserved.`;
export const PRODUCT_COPYRIGHT_TAGLINE = (year: number = 2026) => `© ${year} ${PRODUCT_NAME}. ${PRODUCT_TAGLINE}`;
