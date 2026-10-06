using Microsoft.Extensions.DependencyInjection;

namespace FlowPilot.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        return services;
    }
}
