import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  facets,
  filterExams,
  matchSubjects,
  parseDisplayName,
  parseExams,
  parseSubjects,
  pickSubject,
} from "../src/upbnet/library.js";

// Trimmed copies of real UPBnet responses, with personal names replaced.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const SUBJECT = "ADMINISTRACIÓN DE BASES DE DATOS";

describe("parseSubjects", () => {
  it("reads the hidden code column of every row", () => {
    expect(parseSubjects(fixture("matters.html"))).toEqual([
      "ADMINISTRACIÓN DE BASES DE DATOS",
      "BASES DE DATOS AVANZADAS",
      "ESTADISTICA",
      "ESTADÍSTICA",
      "ESTADÍSTICA I",
    ]);
  });
});

describe("parseExams", () => {
  it("maps each result row to an exam with an absolute PDF url", () => {
    const exams = parseExams(fixture("testsearch.html"), SUBJECT);
    expect(exams).toHaveLength(3);
    expect(exams[0]).toEqual({
      id: "139826_1912_PRIMER_PARCIAL",
      subject: SUBJECT,
      semester: "PRIMERO2020",
      teacher: "DOCENTE UNO",
      campus: "SANTA CRUZ",
      type: "PRIMER_PARCIAL",
      url: "https://sistemas.upb.edu/examenes/139826_1912_PRIMER_PARCIAL.pdf",
    });
  });

  it("returns nothing for the 'No existen datos' placeholder row", () => {
    expect(parseExams(fixture("testsearch-empty.html"), SUBJECT)).toEqual([]);
  });
});

describe("parseDisplayName", () => {
  it("collapses the header's padded whitespace", () => {
    expect(parseDisplayName(fixture("testsearch.html"))).toBe("Ana Pérez Test");
  });

  it("returns null when the header is absent", () => {
    expect(parseDisplayName(fixture("testsearch-empty.html"))).toBeNull();
  });
});

describe("subject matching", () => {
  const subjects = parseSubjects(fixture("matters.html"));

  it("matches all words, ignoring case and accents", () => {
    expect(matchSubjects(subjects, "bases datos")).toEqual([
      "ADMINISTRACIÓN DE BASES DE DATOS",
      "BASES DE DATOS AVANZADAS",
    ]);
  });

  it("resolves an unaccented query to the single accented subject", () => {
    expect(pickSubject(subjects, "administracion de bases de datos")).toBe(SUBJECT);
  });

  it("prefers the literal name when accented and unaccented twins exist", () => {
    expect(pickSubject(subjects, "Estadística")).toBe("ESTADÍSTICA");
    expect(pickSubject(subjects, "estadistica")).toBe("ESTADISTICA");
  });

  it("refuses to guess between twins the query can't tell apart", () => {
    expect(() => pickSubject(subjects, "ESTADISTÍCA")).toThrow(/ESTADISTICA \| ESTADÍSTICA/);
  });

  it("lists candidates for a partial query instead of picking one", () => {
    expect(() => pickSubject(subjects, "bases")).toThrow(/matches several subjects/);
  });

  it("explains when nothing matches", () => {
    expect(() => pickSubject(subjects, "quimica")).toThrow(/No UPBnet subject matches/);
  });
});

describe("filterExams / facets", () => {
  const exams = parseExams(fixture("testsearch.html"), SUBJECT);

  it("filters by accent-insensitive substrings", () => {
    expect(filterExams(exams, { campus: "la paz", semester: "2017" }).map((e) => e.id)).toEqual([
      "131195_1304_PRIMER_PARCIAL",
      "131195_0959_SEGUNDO_PARCIAL",
    ]);
  });

  it("lists distinct values for narrowing", () => {
    expect(facets(exams)).toEqual({
      semesters: ["PRIMERO2020", "SEGUNDO2017"],
      campuses: ["SANTA CRUZ", "LA PAZ"],
      teachers: ["DOCENTE UNO", "DOCENTE DOS"],
      types: ["PRIMER_PARCIAL", "SEGUNDO_PARCIAL"],
    });
  });
});
