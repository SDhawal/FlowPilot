using Microsoft.Extensions.Time.Testing;

namespace FlowPilot.UnitTests;

public sealed class PlaceholderTests
{
    [Fact]
    public void FakeTimeProvider_returns_configured_time()
    {
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var clock = new FakeTimeProvider(now);

        clock.GetUtcNow().ShouldBe(now);
    }
}
