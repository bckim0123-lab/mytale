import type { CompanionStoryBook } from './companion-save';

/** Trusted decorative SVG shared by the reader and downloadable forest book.
 * The center stays clear for the book's own hero. No user text enters markup. */
export function forestHomeEndingArt(
  book: CompanionStoryBook,
  page: number,
): string {
  if (
    book.illustrationTheme ||
    book.choices?.ending !== 'home' ||
    (page !== 3 && page !== 4)
  )
    return '';

  const cottage = (x: number, y: number, mint: boolean) => `
    <g data-lit-cottage="true" transform="translate(${x} ${y})">
      <ellipse cy="41" rx="58" ry="13" fill="#254e43" opacity=".18"/>
      <ellipse cy="23" rx="66" ry="43" fill="#ffe8a9" opacity=".13"/>
      <path d="M-41 36V-21Q0-47 41-21V36Q0 49-41 36" fill="${mint ? '#d9d8b8' : '#efd6ba'}" stroke="#8e8970" stroke-width="2"/>
      <path d="M-53-20Q-49-63-5-68Q39-77 54-20Q24-7 0-20Q-27-7-53-20" fill="${mint ? '#92b4a0' : '#d9a19b'}" stroke="${mint ? '#729383' : '#b6807e'}" stroke-width="3"/>
      <path d="M-42-29Q-22-57 7-57" fill="none" stroke="${mint ? '#cedac1' : '#f1c9b6'}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-11 40V17a11 11 0 0 1 22 0v23" fill="#6d8070"/>
      <circle cx="6" cy="27" r="2" fill="#e4c187"/>
      <g data-lit-window="true" fill="#ffdf93" stroke="#a18561" stroke-width="2">
        <rect x="-31" y="-7" width="19" height="22" rx="8"/>
        <rect x="13" y="-7" width="19" height="22" rx="8"/>
      </g>
      <path d="M-22-4V13M-29 4h15M22-4V13M15 4h15" stroke="#fff4ca" stroke-width="2"/>
      <path d="M-41 34q-16-18-18-3q-2 9 18 10M41 34q16-18 18-3q2 9-18 10" fill="#86aa88"/>
    </g>`;

  return `<g data-home-ending="lit-village">
    <g data-lit-path="true" fill="none" stroke-linecap="round">
      <path d="M83 430Q129 457 165 477Q219 497 255 520M558 435Q505 458 476 481Q424 499 391 520" stroke="#ffe5aa" stroke-width="25" opacity=".28"/>
      <path d="M83 430Q129 457 165 477Q219 497 255 520M558 435Q505 458 476 481Q424 499 391 520" stroke="#f2d5a2" stroke-width="7" stroke-dasharray="1 19" opacity=".9"/>
    </g>
    ${cottage(83, 385, true)}${cottage(558, 390, false)}
    <g fill="#ffe5a1">
      <circle cx="58" cy="436" r="4"/><circle cx="131" cy="457" r="4"/>
      <circle cx="581" cy="442" r="4"/><circle cx="508" cy="461" r="4"/>
    </g>
  </g>`;
}
