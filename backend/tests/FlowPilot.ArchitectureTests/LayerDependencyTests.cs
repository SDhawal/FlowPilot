using System.Reflection;
using NetArchTest.Rules;

namespace FlowPilot.ArchitectureTests;

public sealed class LayerDependencyTests
{
    private const string Application = "FlowPilot.Application";
    private const string Infrastructure = "FlowPilot.Infrastructure";
    private const string Api = "FlowPilot.Api";

    private static readonly Assembly DomainAssembly = typeof(FlowPilot.Domain.AssemblyMarker).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(FlowPilot.Application.AssemblyMarker).Assembly;
    private static readonly Assembly InfrastructureAssembly = typeof(FlowPilot.Infrastructure.AssemblyMarker).Assembly;

    [Fact]
    public void Domain_depends_on_nothing_in_the_solution_or_ef()
    {
        var result = Types.InAssembly(DomainAssembly)
            .ShouldNot()
            .HaveDependencyOnAny(Application, Infrastructure, Api, "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore")
            .GetResult();

        result.IsSuccessful.ShouldBeTrue(Failing(result));
    }

    [Fact]
    public void Domain_assembly_references_no_other_solution_assembly()
    {
        var references = DomainAssembly.GetReferencedAssemblies()
            .Select(a => a.Name)
            .Where(n => n is not null && n.StartsWith("FlowPilot.", StringComparison.Ordinal));

        references.ShouldBeEmpty();
    }

    [Fact]
    public void Application_does_not_depend_on_Infrastructure_or_Api()
    {
        var result = Types.InAssembly(ApplicationAssembly)
            .ShouldNot()
            .HaveDependencyOnAny(Infrastructure, Api)
            .GetResult();

        result.IsSuccessful.ShouldBeTrue(Failing(result));
    }

    [Fact]
    public void Infrastructure_does_not_depend_on_Api()
    {
        var result = Types.InAssembly(InfrastructureAssembly)
            .ShouldNot()
            .HaveDependencyOn(Api)
            .GetResult();

        result.IsSuccessful.ShouldBeTrue(Failing(result));
    }

    private static string Failing(NetArchTest.Rules.TestResult result) =>
        result.FailingTypeNames is null ? string.Empty : "Violations: " + string.Join(", ", result.FailingTypeNames);
}
