/** Sources, licenses and credits. Every data provider asks for attribution. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-about">
          <p className="footer-brand">Nimbo</p>
          <p>
            Built by{" "}
            <a href="https://fsucatti-portfolio.fsucatti-portfolio.workers.dev" target="_blank" rel="noopener noreferrer">
              Francisco Sucatti
            </a>
            . The forecast highlights come from fixed rules, not from official warnings: for those, check your national weather service.
          </p>
        </div>
        <div className="footer-sources">
          <h2 className="footer-title">Data sources</h2>
          <ul>
            <li>
              Weather, air quality, sea and history:{" "}
              <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                Open-Meteo
              </a>{" "}
              (
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
                CC BY 4.0
              </a>
              ), from national weather services including ECMWF, NOAA, DWD, Météo-France, the Met Office, JMA, Environment Canada and CMA.
            </li>
            <li>Air quality: generated using Copernicus Atmosphere Monitoring Service information.</li>
            <li>Climate history: contains modified Copernicus Climate Change Service information (ERA5).</li>
            <li>
              Radar:{" "}
              <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">
                Weather data by RainViewer
              </a>
              . Map:{" "}
              <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
                OpenFreeMap
              </a>
              ,{" "}
              <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">
                © OpenMapTiles
              </a>
              , data from{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                © OpenStreetMap contributors
              </a>
              .
            </li>
            <li>
              Place search: Open-Meteo geocoding with{" "}
              <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">
                GeoNames
              </a>
              . Names for your location and map points:{" "}
              <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">
                Nominatim
              </a>
              , OpenStreetMap data (ODbL).
            </li>
            <li>Sun and moon positions are calculated in your browser with SunCalc.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
