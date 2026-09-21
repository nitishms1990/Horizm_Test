import { describe, expect, it } from "vitest";
import { exposure, mediaValue, quality, sizeFactor } from "@horizm/contracts";
import { percentileOf, postValue, quantile, sponsorRows, type PostRow } from "./scoring.js";

const cpmFor = () => 10;

const detection = (overrides: Partial<PostRow["detections"][number]> = {}) => ({
  id: "d1",
  sponsorId: "s1",
  sponsorName: "Northwind Bank",
  placement: "perimeter_board",
  sizePct: 1,
  clarity: 0.9,
  obstruction: 0,
  counted: true,
  ...overrides,
});

describe("sizeFactor", () => {
  it("tops out at a logo covering 4% of the frame", () => {
    expect(sizeFactor(4)).toBe(1);
    expect(sizeFactor(9)).toBe(1);
  });

  it("halves when the area is a quarter", () => {
    expect(sizeFactor(1)).toBeCloseTo(0.5);
  });
});

describe("quality", () => {
  it("is zero when the logo is fully hidden", () => {
    expect(quality({ size_pct: 4, clarity: 1, obstruction: 1, placement: "shirt_front" })).toBe(0);
  });

  it("rewards the better placement for identical logos", () => {
    const base = { size_pct: 2, clarity: 0.9, obstruction: 0 } as const;
    expect(quality({ ...base, placement: "shirt_front" })).toBeGreaterThan(
      quality({ ...base, placement: "perimeter_board" }),
    );
  });
});

describe("exposure", () => {
  it("never reaches 1 from repeats alone", () => {
    expect(exposure([0.4, 0.4, 0.4, 0.4])).toBeLessThan(1);
  });

  it("grows with each appearance but by less each time", () => {
    const one = exposure([0.4]);
    const two = exposure([0.4, 0.4]);
    const three = exposure([0.4, 0.4, 0.4]);
    expect(two - one).toBeGreaterThan(three - two);
  });
});

describe("mediaValue", () => {
  it("is impressions in thousands times CPM times exposure", () => {
    expect(mediaValue(0.5, 250_000, 12)).toBe(1500);
  });
});

describe("postValue", () => {
  it("ignores detections that were unticked", () => {
    const post: PostRow = {
      id: "p1",
      impressions: 100_000,
      detections: [detection(), detection({ id: "d2", counted: false })],
    };
    const withOne = postValue(post, cpmFor);
    const withBoth = postValue(
      { ...post, detections: post.detections.map((d) => ({ ...d, counted: true })) },
      cpmFor,
    );
    expect(withBoth).toBeGreaterThan(withOne);
  });
});

describe("sponsorRows", () => {
  it("groups appearances by sponsor and sorts by value", () => {
    const posts: PostRow[] = [
      {
        id: "p1",
        impressions: 100_000,
        detections: [
          detection(),
          detection({ id: "d2", sponsorId: "s2", sponsorName: "Volta Energy", sizePct: 0.2, clarity: 0.6 }),
        ],
      },
    ];
    const rows = sponsorRows(posts, cpmFor);
    expect(rows.map((row) => row.name)).toEqual(["Northwind Bank", "Volta Energy"]);
    expect(rows[0].appearances).toBe(1);
  });
});

describe("cohort statistics", () => {
  it("reports the median of a sorted cohort", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("places a value inside its cohort", () => {
    expect(percentileOf(5, [1, 2, 3, 4])).toBe(100);
    expect(percentileOf(0, [1, 2, 3, 4])).toBe(0);
  });
});
