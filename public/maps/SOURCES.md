# Surface maps

These are small, processed versions of public spacecraft maps, made by `scripts/planet-maps.mjs`
(see the top of that file for the channel layout). Each is equirectangular, longitude −180°…180°
east from left to right, north at the top.

| Map                       | Source                                                                                                                                                                                        | Credit                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `earth.png` (surface)     | [Blue Marble Next Generation with topography, January 2004](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/january/world.topo.200401.3x5400x2700.jpg) | NASA Earth Observatory, Reto Stöckli                                                            |
| `earth.png` (clouds)      | [Blue Marble cloud composite](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg)                                           | NASA Earth Observatory                                                                          |
| `earth.png` (city lights) | [Black Marble 2016, greyscale](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg)                                  | NASA Earth Observatory, Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC |
| `moon.png`                | [LROC colour map, CGI Moon Kit](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg)                                                                                      | NASA's Scientific Visualization Studio; LRO/LROC team                                           |
| `mars.png`                | [Viking MDIM 2.1 colour mosaic](https://commons.wikimedia.org/wiki/File:Mars_Viking_MDIM21_ClrMosaic_1km.jpg)                                                                                 | NASA/JPL/USGS Astrogeology                                                                      |
| `mercury.png`             | [MESSENGER global monochrome basemap, 2500 m/px](https://commons.wikimedia.org/wiki/File:Mercury_-_complete_mono_basemap_2500mpp_equirectangular.png)                                         | NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington     |
| `jupiter.png`             | [Cassini cylindrical map of Jupiter, PIA07782](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.jpg)                                          | NASA/JPL/Space Science Institute                                                                |
| `saturn.png`              | [Cassini "True Saturn", PIA06193](http://svs.gsfc.nasa.gov/vis/a030000/a030300/a030348/saturn_full_disk_PIA06193_print.jpg)                                                                   | NASA/JPL/Space Science Institute                                                                |

All are works of NASA (or NASA with USGS) and in the public domain in the United States; NASA asks
for the credit above.

## What was done to them

- Each map was resized and turned into albedo (its linear luminance) plus a surface class (which
  colour the shader paints it), with the simple colour rules in the script. No feature was drawn
  by hand.
- **Mercury:** the basemap is centred on 180° E, so it was shifted half a turn.
- **Saturn:** no clean global map exists, so `saturn.png` is a latitude profile (Saturn's bands run
  along latitude). It was read down one column of the Cassini mosaic, from October 2004, with the
  disk centre at y ≈ 300 px, polar semi-axis ≈ 158 px and the sub-spacecraft latitude ≈ −15°.
  North of about 19° N the rings hide the disk, so that part mirrors the south.
- **Jupiter:** the map's longitudes aren't matched to Jupiter's current rotation, and its clouds
  drift and change all the time, so the Great Red Spot won't be where it is today.
- **Venus, Uranus, Neptune:** no map is used. In visible light Venus is a featureless cloud deck,
  and Uranus and Neptune are nearly featureless, so they're drawn with their measured colours and
  limb darkening only.
