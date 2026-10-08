/// <reference types="jest" />

import { serverStatusKeys } from "../api/server-status-keys";

describe("serverStatusKeys", () => {
  it("builds ready() on top of all so invalidating all covers it", () => {
    expect(serverStatusKeys.ready().slice(0, serverStatusKeys.all.length)).toEqual([
      ...serverStatusKeys.all,
    ]);
    expect(serverStatusKeys.ready()).toEqual(["server-status", "ready"]);
  });
});
