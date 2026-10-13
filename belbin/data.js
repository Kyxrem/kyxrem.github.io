/* Belbin-Teamrollen: Rollenbeschreibungen und Fragebogen.
   Die Aussagen sind eigene Formulierungen zum Belbin-Modell – nicht der
   offizielle Self-Perception Inventory von Belbin Associates. */

const CATEGORIES = {
  action:  { name: "Handlungsorientiert",       hint: "bringen Dinge ins Rollen und zu Ende" },
  people:  { name: "Kommunikationsorientiert",  hint: "verbinden Menschen und Ressourcen" },
  thinking:{ name: "Wissensorientiert",         hint: "liefern Ideen, Analyse und Fachwissen" },
};

const ROLES = {
  SH: {
    name: "Macher", en: "Shaper", cat: "action", icon: "⚡",
    short: "Treibt das Team an und sorgt dafür, dass es vorangeht.",
    strengths: ["Dynamisch und leistungsorientiert", "Hat den Mut, Hindernisse zu überwinden", "Bringt Diskussionen zu Entscheidungen"],
    weaknesses: ["Kann ungeduldig oder provozierend wirken", "Verletzt unter Druck mal Gefühle anderer"],
    tip: "Gib dem Team Tempo – aber prüf ab und zu, ob alle noch mitkommen.",
  },
  IMP: {
    name: "Umsetzer", en: "Implementer", cat: "action", icon: "🛠️",
    short: "Macht aus Ideen konkrete Pläne und setzt sie zuverlässig um.",
    strengths: ["Diszipliniert, verlässlich, effizient", "Denkt praktisch und strukturiert", "Bleibt auch bei unbeliebten Aufgaben dran"],
    weaknesses: ["Eher unflexibel", "Reagiert zurückhaltend auf neue, unerprobte Ideen"],
    tip: "Du bist das Rückgrat jedes Projekts – lass trotzdem Raum für Kurswechsel.",
  },
  CF: {
    name: "Perfektionist", en: "Completer Finisher", cat: "action", icon: "🔍",
    short: "Achtet auf Details und sorgt für ein fehlerfreies Ergebnis.",
    strengths: ["Gewissenhaft und sorgfältig", "Findet Fehler und Lücken", "Hält Termine und Qualitätsstandards ein"],
    weaknesses: ["Neigt zu übertriebener Sorge", "Delegiert ungern"],
    tip: "Deine Gründlichkeit ist Gold wert – unterscheide aber zwischen wichtig und perfekt.",
  },
  CO: {
    name: "Koordinator", en: "Co-ordinator", cat: "people", icon: "🧭",
    short: "Hält das Team auf Kurs und bringt die richtigen Leute an die richtigen Aufgaben.",
    strengths: ["Selbstsicher und vertrauensvoll", "Klärt Ziele und fördert Entscheidungen", "Delegiert gut"],
    weaknesses: ["Kann manipulierend wirken", "Gibt eigene Arbeit gern ab"],
    tip: "Du siehst, wer was kann – pack aber auch selbst sichtbar mit an.",
  },
  TW: {
    name: "Teamarbeiter", en: "Teamworker", cat: "people", icon: "🤝",
    short: "Sorgt für Zusammenhalt und eine gute Atmosphäre im Team.",
    strengths: ["Kooperativ, diplomatisch, aufmerksam", "Hört zu und baut Spannungen ab", "Vermittelt zwischen Standpunkten"],
    weaknesses: ["Unentschlossen in kritischen Situationen", "Vermeidet Konfrontation"],
    tip: "Du hältst das Team zusammen – trau dich auch mal, klar Position zu beziehen.",
  },
  RI: {
    name: "Wegbereiter", en: "Resource Investigator", cat: "people", icon: "🌐",
    short: "Knüpft Kontakte, holt Ideen von außen und entdeckt Chancen.",
    strengths: ["Kommunikativ, extrovertiert, begeisterungsfähig", "Erkennt Möglichkeiten", "Baut Netzwerke auf"],
    weaknesses: ["Oft zu optimistisch", "Verliert das Interesse, wenn die erste Begeisterung verflogen ist"],
    tip: "Du bringst frischen Wind – such dir jemanden, der die Dinge mit dir zu Ende bringt.",
  },
  PL: {
    name: "Neuerer / Erfinder", en: "Plant", cat: "thinking", icon: "💡",
    short: "Liefert kreative, unkonventionelle Ideen und löst schwierige Probleme.",
    strengths: ["Kreativ, fantasievoll, unorthodox", "Löst schwierige Probleme", "Denkt um die Ecke"],
    weaknesses: ["Ignoriert gern Nebensächlichkeiten", "Zu vertieft, um effektiv zu kommunizieren"],
    tip: "Deine Ideen brauchen Zuhörer – erklär sie so, dass andere sie aufgreifen können.",
  },
  ME: {
    name: "Beobachter", en: "Monitor Evaluator", cat: "thinking", icon: "⚖️",
    short: "Bewertet Optionen nüchtern und hilft dem Team, richtig zu entscheiden.",
    strengths: ["Besonnen, strategisch, kritisch", "Betrachtet alle Optionen", "Urteilt genau"],
    weaknesses: ["Kann andere kaum inspirieren", "Wirkt manchmal kühl oder übermäßig kritisch"],
    tip: "Dein klares Urteil schützt das Team vor Fehlern – würdige auch die guten Seiten einer Idee.",
  },
  SP: {
    name: "Spezialist", en: "Specialist", cat: "thinking", icon: "🎓",
    short: "Bringt tiefes Fachwissen ein, das sonst niemand im Team hat.",
    strengths: ["Zielstrebig und engagiert", "Liefert seltenes Fachwissen", "Arbeitet eigenständig"],
    weaknesses: ["Trägt nur in einem engen Bereich bei", "Verliert sich in technischen Details"],
    tip: "Dein Wissen ist wertvoll – zeig, wie es zum großen Ganzen beiträgt.",
  },
};

/* 7 Abschnitte × 9 Aussagen (je eine pro Rolle). Pro Abschnitt werden 10 Punkte verteilt. */
const SECTIONS = [
  {
    title: "Was ich zu einem Team beitrage",
    items: {
      PL: "Mir fallen oft originelle Lösungen ein, auf die sonst niemand kommt.",
      RI: "Ich knüpfe schnell Kontakte und finde heraus, wer oder was uns weiterhelfen kann.",
      CO: "Ich erkenne, wer was gut kann, und verteile Aufgaben entsprechend.",
      SH: "Ich bringe Tempo rein und sorge dafür, dass wir nicht auf der Stelle treten.",
      ME: "Ich kann Vorschläge nüchtern bewerten, ohne mich von Begeisterung mitreißen zu lassen.",
      TW: "Ich spüre, wie es den anderen geht, und helfe, Spannungen abzubauen.",
      IMP: "Ich verwandle Ideen in konkrete, machbare Arbeitsschritte.",
      CF: "Ich entdecke Fehler und Lücken, die anderen durchrutschen.",
      SP: "Ich bringe tiefes Fachwissen in einem bestimmten Bereich mit.",
    },
  },
  {
    title: "Meine möglichen Schwächen im Team",
    items: {
      PL: "Ich bin manchmal so in Gedanken, dass ich Details oder Absprachen vergesse.",
      RI: "Meine Begeisterung lässt schnell nach, wenn der Reiz des Neuen vorbei ist.",
      CO: "Andere finden manchmal, dass ich Arbeit eher verteile, als selbst anzupacken.",
      SH: "Unter Druck kann ich ungeduldig oder schroff werden.",
      ME: "Ich wirke auf andere manchmal kühl oder zu kritisch.",
      TW: "In kritischen Momenten fällt es mir schwer, mich festzulegen.",
      IMP: "Ich tue mich schwer, wenn Pläne ständig umgeworfen werden.",
      CF: "Ich kann schlecht loslassen und gebe ungern Aufgaben ab.",
      SP: "Themen außerhalb meines Fachgebiets interessieren mich wenig.",
    },
  },
  {
    title: "Wenn ich mit anderen an einem Projekt arbeite …",
    items: {
      PL: "… schlage ich gern ungewöhnliche Wege vor, auch wenn sie riskant klingen.",
      RI: "… bringe ich Ideen und Informationen von außen ins Team.",
      CO: "… achte ich darauf, dass alle zu Wort kommen und wir ein gemeinsames Ziel haben.",
      SH: "… dränge ich auf Entscheidungen, wenn die Diskussion zu lange dauert.",
      ME: "… wäge ich alle Optionen sorgfältig ab, bevor ich mich festlege.",
      TW: "… unterstütze ich andere, auch wenn es nicht meine Aufgabe ist.",
      IMP: "… erstelle ich einen Plan und arbeite ihn zuverlässig ab.",
      CF: "… überprüfe ich Ergebnisse lieber noch einmal, bevor sie rausgehen.",
      SP: "… bin ich die Person, die man fragt, wenn es fachlich in die Tiefe geht.",
    },
  },
  {
    title: "Was mich bei der Arbeit antreibt",
    items: {
      PL: "Knifflige Probleme, für die es noch keine Lösung gibt.",
      RI: "Neue Leute kennenlernen und Möglichkeiten entdecken.",
      CO: "Eine Gruppe so zu lenken, dass sie gemeinsam ihr Ziel erreicht.",
      SH: "Herausforderungen und Hindernisse, die überwunden werden wollen.",
      ME: "Die beste Entscheidung zu finden, indem ich Fakten analysiere.",
      TW: "Ein gutes Miteinander, in dem sich alle wohlfühlen.",
      IMP: "Klare Strukturen und das Gefühl, etwas Handfestes geschafft zu haben.",
      CF: "Eine Aufgabe sauber und vollständig abzuschließen.",
      SP: "Mein Wissen zu vertiefen und in meinem Gebiet richtig gut zu sein.",
    },
  },
  {
    title: "Wenn wir unter Zeitdruck stehen …",
    items: {
      PL: "… suche ich nach einem cleveren Ansatz, der uns Arbeit erspart.",
      RI: "… frage ich herum, ob jemand schon eine Lösung kennt oder helfen kann.",
      CO: "… sorge ich dafür, dass Prioritäten klar sind und alle wissen, was zu tun ist.",
      SH: "… übernehme ich die Führung und treibe alle an.",
      ME: "… behalte ich einen kühlen Kopf und prüfe, ob wir das Richtige tun.",
      TW: "… halte ich die Stimmung hoch und fange Stress im Team auf.",
      IMP: "… arbeite ich diszipliniert die nötigen Schritte ab.",
      CF: "… achte ich darauf, dass trotz Eile nichts Wichtiges vergessen wird.",
      SP: "… konzentriere ich mich auf den Teil, in dem ich mich am besten auskenne.",
    },
  },
  {
    title: "In Diskussionen …",
    items: {
      PL: "… bringe ich oft neue Ideen ein, die die Richtung ändern.",
      RI: "… greife ich Ideen anderer auf und überlege, wo man sie noch nutzen kann.",
      CO: "… fasse ich zusammen und führe die Gruppe zu einer Entscheidung.",
      SH: "… vertrete ich meine Meinung deutlich, auch wenn es Widerspruch gibt.",
      ME: "… weise ich auf Schwachstellen in Argumenten hin.",
      TW: "… vermittle ich zwischen unterschiedlichen Standpunkten.",
      IMP: "… frage ich, wie sich das praktisch umsetzen lässt.",
      CF: "… achte ich auf Genauigkeit und korrigiere ungenaue Aussagen.",
      SP: "… melde ich mich vor allem, wenn es um mein Fachgebiet geht.",
    },
  },
  {
    title: "Was mich an Teamarbeit stören kann",
    items: {
      PL: "Wenn meine Ideen abgetan werden, ziehe ich mich leicht zurück.",
      RI: "Routineaufgaben langweilen mich schnell.",
      CO: "Ich werde unruhig, wenn ein Team kein klares gemeinsames Ziel hat.",
      SH: "Mich frustriert es, wenn andere zu langsam oder unentschlossen sind.",
      ME: "Mich stört es, wenn Entscheidungen nur aus dem Bauch heraus getroffen werden.",
      TW: "Konflikte und Streit im Team belasten mich stark.",
      IMP: "Vage Ideen ohne konkreten Plan machen mich unzufrieden.",
      CF: "Schlampige Arbeit anderer kann mich richtig ärgern.",
      SP: "Ich verliere die Geduld, wenn Leute ohne Fachwissen mitreden wollen.",
    },
  },
];

const POINTS_PER_SECTION = 10;
