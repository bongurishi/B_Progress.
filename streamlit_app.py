
import streamlit as st
import streamlit.components.v1 as components
import os

# Set page configuration
st.set_page_config(
    page_title="B-Progress Tracker",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Hide Streamlit header/footer for a cleaner "app" look
hide_st_style = """
            <style>
            #MainMenu {visibility: hidden;}
            footer {visibility: hidden;}
            header {visibility: hidden;}
            .stApp { margin: 0; padding: 0; }
            iframe { height: 100vh; width: 100%; border: none; }
            </style>
            """
st.markdown(hide_st_style, unsafe_allow_html=True)

# Path to the built React app
build_path = os.path.join(os.getcwd(), "dist")
index_path = os.path.join(build_path, "index.html")

if os.path.exists(index_path):
    with open(index_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Inject both Gemini API Key and Supabase Credentials
    api_key = st.secrets.get("API_KEY", "")
    sb_url = st.secrets.get("SUPABASE_URL", "")
    sb_key = st.secrets.get("SUPABASE_KEY", "")
    
    injection_script = f"""
    <script>
        window.process = {{ 
            env: {{ 
                API_KEY: "{api_key}",
                SUPABASE_URL: "{sb_url}",
                SUPABASE_KEY: "{sb_key}"
            }} 
        }};
    </script>
    """
    html_content = html_content.replace('<head>', f'<head>{injection_script}')
    
    # Serve the component
    components.html(html_content, height=1000, scrolling=True)
else:
    st.error("🚀 Build folder not found!")
    st.info("To host this on Streamlit, you must first run `npm run build` and include the `dist` folder in your repository.")
    st.markdown("""
    ### Quick Fix:
    1. Open your terminal.
    2. Run `npm install`.
    3. Run `npm run build`.
    4. Commit and push the `dist/` folder to GitHub.
    """)
