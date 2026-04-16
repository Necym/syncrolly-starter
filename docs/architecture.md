# Architecture Notes

## Approach
Mobile-first with Expo. Keep web support minimal initially through Next.js. Shared domain logic lives in `packages/core`.

## Apps
- `apps/mobile`: primary product surface
- `apps/web`: future support, simple shell for now

## Packages
- `packages/core`: types, permission rules, mock data
- `packages/config`: shared product constants

## Principles
- Start with mocked local data
- Build one workflow at a time
- Avoid backend work until core flows feel right
