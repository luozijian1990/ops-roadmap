FROM python:3.12-slim
WORKDIR /lab
COPY app.py labctl.py ./
RUN mkdir /data && chown 10001:10001 /data
USER 10001:10001
EXPOSE 8088
CMD ["python3", "app.py", "--host", "0.0.0.0", "--state", "/data"]
