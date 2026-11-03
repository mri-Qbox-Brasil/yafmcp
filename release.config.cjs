module.exports = {
    branches: ["main"],
    plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
        "@semantic-release/changelog",
        [
            "@semantic-release/npm",
            {
                // O publish e do workflow publish.yml (trusted publishing/OIDC,
                // amarrado ao nome do arquivo). Aqui so bumpa o package.json pro
                // @semantic-release/git commitar; com npmPublish=false o plugin
                // nao pede credencial.
                "npmPublish": false,
                "pkgRoot": "."
            }
        ],
        [
            "@semantic-release/git",
            {
                "assets": ["package.json", "CHANGELOG.md"],
                "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
            }
        ],
        "@semantic-release/github"
    ]
};
