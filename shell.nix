{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.bun
    pkgs.prisma-engines
  ];
}
