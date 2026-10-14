import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signedUrl = vi.fn();
vi.mock("@/lib/data", () => ({ signedUrl: (...a: unknown[]) => signedUrl(...a) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (en: string) => en, lang: "en" }) }));
import { PrivateVideoPlayer } from "./private-video-player";

describe("PrivateVideoPlayer", () => {
  beforeEach(() => signedUrl.mockReset());
  it("requests a 900 s signed URL from the private deliverables bucket", async () => {
    signedUrl.mockResolvedValue("https://x/v.mp4?token=t");
    const { container } = render(<PrivateVideoPlayer path="job/final.mp4" />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(signedUrl).toHaveBeenCalledWith("deliverables", "job/final.mp4", 900);
    const v = container.querySelector("video")!;
    expect(v.hasAttribute("controls")).toBe(true);
    expect(v.hasAttribute("playsinline")).toBe(true);
  });
  it("shows an error with Try again, and retry signs again", async () => {
    signedUrl.mockRejectedValueOnce(new Error("denied")).mockResolvedValue("https://x/v.mp4");
    render(<PrivateVideoPlayer path="p.mp4" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(signedUrl).toHaveBeenCalledTimes(2));
  });
  it("re-signs once automatically when playback fails, then shows the error", async () => {
    signedUrl.mockResolvedValue("https://x/v.mp4");
    const { container } = render(<PrivateVideoPlayer path="p.mp4" />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    fireEvent.error(container.querySelector("video")!);
    await waitFor(() => expect(signedUrl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    fireEvent.error(container.querySelector("video")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(signedUrl).toHaveBeenCalledTimes(2);
  });
});
