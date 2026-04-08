import '../assets/style/globals.css';
import 'react-datepicker/dist/react-datepicker.css';
import { NotificationProvider } from '../context/NotificationContext';

/* Wrapper global da aplicação — envolve todas as páginas */
export default function App({ Component, pageProps }) {
  return (
    <NotificationProvider>
      <Component {...pageProps} />
    </NotificationProvider>
  );
}
