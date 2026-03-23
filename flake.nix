{
  description = "Development environment for quartz-syncer with E2E testing support";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
          };
        };

        linuxLibraries = (
          if pkgs.stdenv.isLinux then
            with pkgs;
            [
              libdrm
              alsa-lib
              udev
              libx11
              libxcomposite
              libxdamage
              libxext
              libxfixes
              libxrandr
              libxcb
              libxcursor
              libxi
              libxrender
              libxtst
              libxscrnsaver
              gtk3
              gtk4
              libGL
              libgbm
              fontconfig
              freetype
              libuuid
              systemd
              wayland
              libnotify
              libappindicator-gtk3
              libdbusmenu
            ]
          else
            [ ]
        );

        libraries =
          with pkgs;
          [
            stdenv.cc.cc.lib
            zlib
            glib
            nss
            nspr
            atk
            cups
            dbus
            dbus.lib
            expat
            libxkbcommon
            pango
            cairo
            mesa
            at-spi2-atk
            at-spi2-core
            curl
            wget
          ]
          ++ linuxLibraries;

        nix-ld-libraries = pkgs.lib.makeLibraryPath libraries;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs =
            with pkgs;
            [
              nodejs_22
              git
              python3
            ]
            ++ libraries;

          NIX_LD_LIBRARY_PATH = nix-ld-libraries;
          NIX_LD = pkgs.lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

          shellHook = ''
            echo "quartz-syncer development environment loaded"
            echo "Node.js version: $(node --version)"
            echo ""
            echo "Run 'npm install' to install dependencies"
            echo "Run 'npm test' to run unit tests"
            echo "Run 'npx wdio run ./wdio.conf.mts' to run E2E tests"
          '';
        };
      }
    );
}
