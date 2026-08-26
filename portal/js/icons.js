// portal/js/icons.js
// Iconos SVG inline (stroke = currentColor). Sin CDN: el shell no depende de la
// red, lo que ayuda a la PWA y al rendimiento. viewBox 24x24.

const s = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

export const ICON = {
  home:  s('<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.4V21h13V9.4"/><path d="M9.5 21v-6h5v6"/>'),
  treat: s('<rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9 4V3h6v1"/><path d="M8.5 12.5h2l1 2 1.5-4 1 2h2"/>'),
  calendar: s('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/>'),
  calendarPlus: s('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/><path d="M12 13v4M10 15h4"/>'),
  user:  s('<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.4-3.6 4.2-5 7.5-5s6.1 1.4 7.5 5"/>'),
  logout: s('<path d="M15 5.5H6.5A2.5 2.5 0 0 0 4 8v8a2.5 2.5 0 0 0 2.5 2.5H15"/><path d="M18 8l4 4-4 4"/><path d="M22 12H10"/>'),
  share: s('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>'),
  download: s('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/>'),
  doc: s('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
  chevron: s('<path d="M9 6l6 6-6 6"/>'),
  edit:  s('<path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  tooth: s('<path d="M12 4c-1.6 0-2.4.8-4 .8S5 4 4.5 6.2C4 9 5 11 5.6 14c.4 2.4.9 5 2.1 5 1.3 0 1.4-2.4 1.7-4.2.2-1.2.4-2 .8-2h1.6c.4 0 .6.8.8 2 .3 1.8.4 4.2 1.7 4.2 1.2 0 1.7-2.6 2.1-5 .6-3 1.6-5 1.1-7.8C18.9 4 17.2 4.8 16 4.8S13.6 4 12 4z"/>'),
  bell:  s('<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>'),
  back:  s('<path d="M15 6l-6 6 6 6"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>'),
  x:     s('<path d="M6 6l12 12M18 6L6 18"/>'),
};
