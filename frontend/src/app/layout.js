import "./globals.css";
export const metadata = {
  title: "NorthStar Insurance",
  description: "Secure insurance service portal",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
