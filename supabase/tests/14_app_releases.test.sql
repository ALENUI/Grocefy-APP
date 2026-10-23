-- App releases: anyone (also signed out) reads the published builds; only the service role (publish-release) writes.
begin;
select tests.household();

-- Published by the Edge Function, which runs as the service role and bypasses RLS.
insert into public.app_releases (platform, build_number, version, download_url) values
  ('android', 3, '1.0.0', 'https://expo.dev/builds/three'), ('android', 5, '1.0.1', 'https://expo.dev/builds/five');
select tests.throws($$ insert into public.app_releases (platform, build_number, version, download_url) values ('android', 5, '1.0.1', 'https://expo.dev/builds/again') $$,
  'duplicate key', 'a build number is published once per platform');
select tests.throws($$ insert into public.app_releases (platform, build_number, version, download_url) values ('android', 6, '1.0.2', 'http://insecure.example/app.apk') $$,
  'check constraint', 'downloads must use https');

select tests.login_anon();
select tests.assert((select build_number from public.app_releases where platform = 'android' order by build_number desc limit 1) = 5, 'signed-out apps see the newest build');
select tests.throws($$ insert into public.app_releases (platform, build_number, version, download_url) values ('android', 9, '9.9.9', 'https://evil.example/app.apk') $$,
  'permission denied', 'anonymous users cannot publish a build');
reset role;

select tests.login('owner');
select tests.assert((select count(*) from public.app_releases) = 2, 'signed-in users see published builds');
select tests.throws($$ insert into public.app_releases (platform, build_number, version, download_url) values ('android', 9, '9.9.9', 'https://evil.example/app.apk') $$,
  'permission denied', 'users cannot publish a build');
select tests.throws($$ update public.app_releases set download_url = 'https://evil.example/app.apk' $$, 'permission denied', 'users cannot redirect a download');
select tests.throws($$ delete from public.app_releases $$, 'permission denied', 'users cannot remove builds');
reset role;

rollback;
