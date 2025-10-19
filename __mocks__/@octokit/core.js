const MockOctokit = jest.fn().mockImplementation(() => ({}));

MockOctokit.plugin = jest.fn(() => MockOctokit);

module.exports = {
	Octokit: MockOctokit,
};
