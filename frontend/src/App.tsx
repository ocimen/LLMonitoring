import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Typography, Box } from '@mui/material';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            LLM Brand Monitoring Platform
          </Typography>
          <Typography variant="h6" component="p" gutterBottom>
            Track your brand visibility across AI-powered search engines
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Development environment is ready! 🚀
          </Typography>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;